'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  ArrowLeft, Loader2, Video, Square, Play, Mic, ShieldCheck,
  Download, AlertTriangle, CheckCircle2,
} from 'lucide-react'

const MAX_DURATION_SEC = 60

type Phase = 'permission' | 'ready' | 'recording' | 'review' | 'submitting' | 'submitted'

export default function VideoAttestationPage() {
  const params = useParams()
  const router = useRouter()
  const loanRequestId = params?.loan_request_id as string
  const supabase = createClient()

  const videoLiveRef = useRef<HTMLVideoElement>(null)
  const videoReviewRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<any>(null)
  const startTsRef = useRef<number>(0)

  const [phase, setPhase] = useState<Phase>('permission')
  const [profileName, setProfileName] = useState<string>('')
  const [amountMajor, setAmountMajor] = useState<number>(0)
  const [currency, setCurrency] = useState<string>('NAD')
  const [todayStr, setTodayStr] = useState<string>('')

  // Live capture state
  const [elapsedSec, setElapsedSec] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [speechSupported, setSpeechSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reviewed-form state
  const [transcript, setTranscript] = useState('')
  const [spokenName, setSpokenName] = useState('')
  const [spokenDate, setSpokenDate] = useState('')   // YYYY-MM-DD
  const [spokenAmount, setSpokenAmount] = useState<string>('')
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoHash, setVideoHash] = useState<string | null>(null)
  const [videoDuration, setVideoDuration] = useState<number>(0)

  // Load loan request + profile
  useEffect(() => {
    void (async () => {
      const today = new Date()
      setTodayStr(today.toISOString().slice(0, 10))
      setSpokenDate(today.toISOString().slice(0, 10))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }
      const { data: link } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()
      if (link) {
        const { data: borrower } = await supabase
          .from('borrowers')
          .select('full_name')
          .eq('id', link.borrower_id)
          .single()
        if (borrower?.full_name) {
          setProfileName(borrower.full_name)
          setSpokenName(borrower.full_name)
        }
      }
      const { data: lr } = await supabase
        .from('loan_requests')
        .select('amount_minor, currency')
        .eq('id', loanRequestId)
        .maybeSingle()
      if (lr) {
        const amount = Number(lr.amount_minor) / 100
        setAmountMajor(amount)
        setSpokenAmount(amount.toString())
        setCurrency(lr.currency ?? 'NAD')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanRequestId])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      recognitionRef.current?.stop?.()
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requestPermission = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoLiveRef.current) {
        videoLiveRef.current.srcObject = stream
      }
      setPhase('ready')
    } catch (e: any) {
      setError(e.message ?? 'Camera/microphone permission denied')
    }
  }

  const startRecording = () => {
    if (!streamRef.current) return
    setError(null)
    setLiveTranscript('')
    chunksRef.current = []

    // Try webm first; fall back to default if not supported (Safari).
    const preferredMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : undefined
    const recorder = preferredMime
      ? new MediaRecorder(streamRef.current, { mimeType: preferredMime })
      : new MediaRecorder(streamRef.current)
    recorderRef.current = recorder
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => onRecordingStopped(recorder.mimeType)
    recorder.start(500)
    startTsRef.current = performance.now()

    // Speech recognition (Chrome/Edge). Falls back to manual transcript editing.
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SR) {
      const recog = new SR()
      recog.lang = 'en-US'
      recog.continuous = true
      recog.interimResults = true
      recog.onresult = (event: any) => {
        let text = ''
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript + ' '
        }
        setLiveTranscript(text.trim())
      }
      recog.onerror = () => {/* swallow — final transcript will be empty, user can type */}
      recog.start()
      recognitionRef.current = recog
    } else {
      setSpeechSupported(false)
    }

    setPhase('recording')
    // Auto-stop at MAX_DURATION_SEC
    const tick = () => {
      const elapsed = (performance.now() - startTsRef.current) / 1000
      setElapsedSec(elapsed)
      if (elapsed >= MAX_DURATION_SEC) {
        stopRecording()
      } else if (recorder.state === 'recording') {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    recognitionRef.current?.stop?.()
  }

  const onRecordingStopped = async (mimeType: string) => {
    const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
    const duration = Math.round((performance.now() - startTsRef.current) / 1000)
    const arrayBuffer = await blob.arrayBuffer()
    const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer)
    const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

    const url = URL.createObjectURL(blob)
    setVideoBlob(blob)
    setVideoUrl(url)
    setVideoHash(hash)
    setVideoDuration(duration)

    // Capture the live transcript snapshot for the editable review form.
    setTranscript(liveTranscript)

    // Try to parse date/amount from the transcript heuristically — but always
    // let the borrower edit before submitting.
    parseSpoken(liveTranscript)

    setPhase('review')
  }

  const parseSpoken = (text: string) => {
    if (!text) return
    const lower = text.toLowerCase()

    // Amount: first number > 10 in the transcript.
    const amountMatch = lower.match(/\b(\d{2,}(?:[.,]\d+)?)\b/)
    if (amountMatch) {
      const parsed = Number(amountMatch[1].replace(',', '.'))
      if (!Number.isNaN(parsed) && parsed >= 10) setSpokenAmount(String(parsed))
    }

    // Date: very loose — look for month names. If the borrower says "today is
    // the fourteenth of May" we don't try to parse — they can edit the field.
    // We default the field to today anyway.
  }

  const submit = async () => {
    if (!videoHash || !videoBlob) return
    setPhase('submitting')
    setError(null)
    try {
      const res = await fetch('/api/borrower/video-attestation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          loan_request_id: loanRequestId,
          video_hash: videoHash,
          video_duration_seconds: videoDuration,
          video_size_bytes: videoBlob.size,
          attestation_transcript: transcript,
          attestation_language: 'en-US',
          spoken_name: spokenName || null,
          spoken_date: spokenDate || null,
          spoken_amount: spokenAmount ? Number(spokenAmount) : null,
          spoken_currency: currency,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save attestation')
      setPhase('submitted')
    } catch (e: any) {
      setError(e.message)
      setPhase('review')
    }
  }

  const reset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoBlob(null)
    setVideoUrl(null)
    setVideoHash(null)
    setVideoDuration(0)
    setLiveTranscript('')
    setTranscript('')
    setElapsedSec(0)
    setPhase('ready')
  }

  const script = profileName && amountMajor > 0
    ? `My name is ${profileName}. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. I am requesting ${currency} ${amountMajor.toLocaleString()}. I confirm this is me and I am requesting this loan voluntarily.`
    : 'Loading...'

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Link href="/b/requests" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to loan requests
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Video attestation
          </CardTitle>
          <CardDescription>
            Record a short video stating your name, today's date, and the amount you are requesting.
            The platform stores only the transcript + a fingerprint; you'll email the video file directly to the lender.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {phase === 'permission' && (
            <>
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>What we record vs what we store</AlertTitle>
                <AlertDescription className="text-sm space-y-2">
                  <p>You will read this short script on camera (~15 seconds):</p>
                  <blockquote className="border-l-2 pl-3 italic">{script}</blockquote>
                  <p><strong>The video itself stays on your device.</strong> Only the spoken text and a tamper-evident hash are stored on Credlio. You then email the video to the lender as part of your loan request.</p>
                </AlertDescription>
              </Alert>
              <Button onClick={requestPermission} className="w-full">
                <Mic className="h-4 w-4 mr-2" /> Allow camera & microphone
              </Button>
            </>
          )}

          {(phase === 'ready' || phase === 'recording') && (
            <>
              <video
                ref={videoLiveRef}
                autoPlay
                muted
                playsInline
                className="w-full rounded-lg bg-black aspect-video"
              />
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Read this aloud</p>
                <p className="text-sm leading-relaxed">{script}</p>
              </div>
              {phase === 'recording' && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      Recording · {Math.floor(elapsedSec)}s / {MAX_DURATION_SEC}s
                    </span>
                    <Button size="sm" variant="destructive" onClick={stopRecording}>
                      <Square className="h-4 w-4 mr-1" /> Stop
                    </Button>
                  </div>
                  {speechSupported && (
                    <div className="rounded-lg border bg-blue-50 p-3 text-sm min-h-[3em]">
                      <p className="text-xs uppercase tracking-wider text-blue-700 mb-1">Live transcript</p>
                      <p>{liveTranscript || <em className="text-muted-foreground">Listening…</em>}</p>
                    </div>
                  )}
                </>
              )}
              {phase === 'ready' && (
                <Button onClick={startRecording} className="w-full" size="lg">
                  <Play className="h-4 w-4 mr-2" /> Start recording
                </Button>
              )}
            </>
          )}

          {(phase === 'review' || phase === 'submitting') && videoUrl && (
            <>
              <video ref={videoReviewRef} src={videoUrl} controls playsInline className="w-full rounded-lg bg-black aspect-video" />

              {!speechSupported && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Type what you said</AlertTitle>
                  <AlertDescription>Your browser doesn't support live transcription. Please type the transcript below so we have a written record.</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="transcript">Transcript</Label>
                <Textarea id="transcript" rows={3} value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="What you said in the video" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sp-name">Spoken name</Label>
                  <Input id="sp-name" value={spokenName} onChange={e => setSpokenName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sp-date">Spoken date</Label>
                  <Input id="sp-date" type="date" value={spokenDate} onChange={e => setSpokenDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sp-amt">Spoken amount</Label>
                  <Input id="sp-amt" type="number" step="any" value={spokenAmount} onChange={e => setSpokenAmount(e.target.value)} />
                </div>
              </div>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={submit} disabled={phase === 'submitting' || !transcript} className="flex-1">
                  {phase === 'submitting' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Save attestation
                </Button>
                <Button variant="outline" onClick={reset}>Re-record</Button>
              </div>
            </>
          )}

          {phase === 'submitted' && videoUrl && videoBlob && (
            <>
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-700" />
                <AlertTitle>Attestation saved</AlertTitle>
                <AlertDescription>
                  Your spoken transcript and the video fingerprint are recorded. Two final steps:
                </AlertDescription>
              </Alert>

              <ol className="list-decimal list-inside space-y-3 text-sm">
                <li>
                  <strong>Download the video</strong> from this device.
                  <div className="mt-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={videoUrl} download={`attestation-${loanRequestId.slice(0, 8)}.webm`}>
                        <Download className="h-4 w-4 mr-2" /> Download video
                      </a>
                    </Button>
                  </div>
                </li>
                <li>
                  <strong>Email the video</strong> to the lender once they make you an offer.
                  The platform has logged the fingerprint, so the lender can verify the file you send
                  is the same one you recorded here.
                </li>
              </ol>

              <Button onClick={() => router.push('/b/requests')} className="w-full">Done</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
