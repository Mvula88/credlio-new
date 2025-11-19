'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  MessageSquare,
  Send,
  User,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  Search
} from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

export default function MessagesPage() {
  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState<any[]>([])
  const [selectedThread, setSelectedThread] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [lenderId, setLenderId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    loadThreads()
  }, [])

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id)
    }
  }, [selectedThread])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadThreads = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }

      const { data: lender } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!lender) return

      setLenderId(lender.user_id)

      // Get all message threads for this lender
      const { data: threadData, error } = await supabase
        .from('message_threads')
        .select(`
          *,
          loan_requests!message_threads_request_id_fkey(
            id,
            purpose,
            amount_minor,
            status
          ),
          loan_offers!message_threads_offer_id_fkey(
            id,
            amount_minor,
            apr_bps,
            status
          )
        `)
        .eq('lender_id', lender.user_id)
        .order('last_message_at', { ascending: false })

      if (error) {
        console.error('Error loading threads:', error)
        return
      }

      // Get unread count and borrower info for each thread
      const threadsWithUnread = await Promise.all(
        (threadData || []).map(async (thread) => {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', thread.id)
            .eq('sender_type', 'borrower')
            .is('read_at', null)

          // Get borrower info
          const { data: borrowerData } = await supabase
            .from('borrowers')
            .select('id, full_name, phone_e164')
            .eq('id', thread.borrower_id)
            .single()

          return {
            ...thread,
            unread_count: count || 0,
            borrowers: borrowerData
          }
        })
      )

      setThreads(threadsWithUnread)

      // Auto-select first thread if available
      if (threadsWithUnread.length > 0 && !selectedThread) {
        setSelectedThread(threadsWithUnread[0])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (threadId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error loading messages:', error)
        return
      }

      setMessages(data || [])

      // Mark messages as read
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('thread_id', threadId)
        .eq('sender_type', 'borrower')
        .is('read_at', null)

      // Reload threads to update unread count
      await loadThreads()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedThread || !lenderId) return

    try {
      setSending(true)

      // Check for spam keywords
      const spamKeywords = ['bank account', 'password', 'pin', 'otp', 'verification code']
      const isFlagged = spamKeywords.some(keyword =>
        newMessage.toLowerCase().includes(keyword)
      )

      const { error } = await supabase
        .from('messages')
        .insert({
          thread_id: selectedThread.id,
          sender_type: 'lender',
          sender_id: lenderId,
          message: newMessage,
          flagged_as_spam: isFlagged
        })

      if (error) {
        console.error('Error sending message:', error)
        return
      }

      // Update thread last_message_at
      await supabase
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedThread.id)

      setNewMessage('')
      await loadMessages(selectedThread.id)
      await loadThreads()
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setSending(false)
    }
  }

  const formatCurrency = (amountMinor: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amountMinor / 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-600 mt-1">Communicate with borrowers about loan offers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Threads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{threads.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Unread Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {threads.reduce((sum, t) => sum + t.unread_count, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {threads.filter(t => t.status === 'active').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Messaging Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Thread List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <span>Conversations</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {threads.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No conversations yet</p>
                <p className="text-sm text-gray-500 mt-2">
                  Messages will appear when you make offers
                </p>
              </div>
            ) : (
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedThread?.id === thread.id ? 'bg-blue-50 border-l-4 border-primary' : ''
                    }`}
                    onClick={() => setSelectedThread(thread)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <Avatar>
                          <AvatarFallback className="bg-primary text-white">
                            {thread.borrowers?.full_name?.charAt(0) || 'B'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {thread.borrowers?.full_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-600 truncate">
                            {thread.loan_requests?.purpose || 'Loan Discussion'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {format(new Date(thread.last_message_at), 'MMM dd, HH:mm')}
                          </p>
                        </div>
                      </div>
                      {thread.unread_count > 0 && (
                        <Badge className="bg-blue-600 text-white ml-2">
                          {thread.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message Area */}
        <Card className="lg:col-span-2">
          {!selectedThread ? (
            <CardContent className="flex items-center justify-center h-[600px]">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Select a conversation to start messaging</p>
              </div>
            </CardContent>
          ) : (
            <>
              {/* Thread Header */}
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <User className="h-5 w-5" />
                      <span>{selectedThread.borrowers?.full_name || 'Unknown'}</span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {selectedThread.loan_requests?.purpose || 'Loan Discussion'}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    {selectedThread.loan_offers && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          Your Offer: {formatCurrency(selectedThread.loan_offers.amount_minor)}
                        </p>
                        <Badge className={
                          selectedThread.loan_offers.status === 'accepted'
                            ? 'bg-green-100 text-green-800'
                            : selectedThread.loan_offers.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }>
                          {selectedThread.loan_offers.status}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Messages */}
              <CardContent className="p-4">
                <div className="h-[400px] overflow-y-auto space-y-4 mb-4">
                  {messages.map((message) => {
                    const isLender = message.sender_type === 'lender'
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isLender ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-4 py-2 ${
                            isLender
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {message.flagged_as_spam && (
                            <Alert className="mb-2 bg-yellow-50 border-yellow-200">
                              <AlertTriangle className="h-3 w-3 text-yellow-600" />
                              <AlertDescription className="text-xs text-yellow-700">
                                This message was flagged for potential spam
                              </AlertDescription>
                            </Alert>
                          )}
                          <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                          <div className="flex items-center justify-between mt-1">
                            <p className={`text-xs ${isLender ? 'text-white/70' : 'text-gray-500'}`}>
                              {format(new Date(message.created_at), 'HH:mm')}
                            </p>
                            {isLender && message.read_at && (
                              <CheckCircle className="h-3 w-3 text-white/70" />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="flex space-x-2 border-t pt-4">
                  <Input
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    disabled={sending}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Never share sensitive information like passwords, PINs, or bank account details.
                    Messages containing suspicious keywords will be flagged.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
