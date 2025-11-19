'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function VerifyRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to unified onboarding
    router.push('/b/onboarding')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Redirecting to verification...</p>
      </div>
    </div>
  )
}
