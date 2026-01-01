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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MessageSquare,
  User,
  AlertTriangle,
  CheckCircle,
  Search,
  Flag,
  Shield,
  XCircle,
  Eye,
  Trash2
} from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

export default function AdminMessagesPage() {
  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState<any[]>([])
  const [selectedThread, setSelectedThread] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showFlagged, setShowFlagged] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    loadThreads()
  }, [statusFilter, showFlagged])

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
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      // Get all message threads (admin view)
      let query = supabase
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
        .order('last_message_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data: threadData, error } = await query

      if (error) {
        console.error('Error loading threads:', error)
        return
      }

      // Get additional info for each thread
      const threadsWithInfo = await Promise.all(
        (threadData || []).map(async (thread: any) => {
          // Get flagged message count
          const { count: flaggedCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', thread.id)
            .eq('flagged_as_spam', true)

          // Get total message count
          const { count: totalCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', thread.id)

          // Get borrower info (include phone for search)
          const { data: borrowerData } = await supabase
            .from('borrowers')
            .select('id, full_name, phone_e164')
            .eq('id', thread.borrower_id)
            .single()

          // Get lender info
          const { data: lenderData } = await supabase
            .from('lenders')
            .select('user_id, business_name, full_name')
            .eq('user_id', thread.lender_id)
            .single()

          return {
            ...thread,
            flagged_count: flaggedCount || 0,
            message_count: totalCount || 0,
            borrower: borrowerData,
            lender: lenderData
          }
        })
      )

      // Filter by flagged if needed
      let filteredThreads = threadsWithInfo
      if (showFlagged) {
        filteredThreads = threadsWithInfo.filter(t => t.flagged_count > 0)
      }

      // Filter by search term (phone number or ID)
      if (searchTerm) {
        const search = searchTerm.toLowerCase().replace(/\s/g, '')
        filteredThreads = filteredThreads.filter(t =>
          t.borrower?.phone_e164?.includes(search) ||
          t.borrower?.id?.toLowerCase().includes(search) ||
          t.lender?.user_id?.toLowerCase().includes(search)
        )
      }

      setThreads(filteredThreads)
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
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const unflagMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ flagged_as_spam: false })
        .eq('id', messageId)

      if (error) {
        console.error('Error unflagging message:', error)
        return
      }

      // Reload messages and threads
      if (selectedThread) {
        await loadMessages(selectedThread.id)
      }
      await loadThreads()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const closeThread = async (threadId: string) => {
    try {
      const { error } = await supabase
        .from('message_threads')
        .update({ status: 'closed' })
        .eq('id', threadId)

      if (error) {
        console.error('Error closing thread:', error)
        return
      }

      setSelectedThread(null)
      await loadThreads()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const deleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to permanently delete this message? This action cannot be undone.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)

      if (error) {
        console.error('Error deleting message:', error)
        alert('Failed to delete message')
        return
      }

      // Reload messages
      if (selectedThread) {
        await loadMessages(selectedThread.id)
      }
      await loadThreads()
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to delete message')
    }
  }

  const deleteThread = async (threadId: string) => {
    if (!confirm('Are you sure you want to permanently delete this entire conversation? This will remove all messages and the thread from everyone\'s view. This action cannot be undone.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('message_threads')
        .delete()
        .eq('id', threadId)

      if (error) {
        console.error('Error deleting thread:', error)
        alert('Failed to delete thread')
        return
      }

      setSelectedThread(null)
      await loadThreads()
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to delete thread')
    }
  }

  const formatCurrency = (amountMinor: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amountMinor / 100)
  }

  const totalMessages = threads.reduce((sum, t) => sum + t.message_count, 0)
  const totalFlagged = threads.reduce((sum, t) => sum + t.flagged_count, 0)

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
        <h1 className="text-3xl font-bold text-gray-900">Message Moderation</h1>
        <p className="text-gray-600 mt-1">Monitor and moderate platform communications</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <CardTitle className="text-sm font-medium text-gray-600">Active Threads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {threads.filter(t => t.status === 'active').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalMessages}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Flagged Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalFlagged}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by phone or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={showFlagged ? 'default' : 'outline'}
          onClick={() => setShowFlagged(!showFlagged)}
        >
          <Flag className="h-4 w-4 mr-2" />
          {showFlagged ? 'Showing Flagged' : 'Show Flagged Only'}
        </Button>
      </div>

      {/* Main Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Thread List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>All Conversations</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {threads.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No conversations found</p>
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
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <Avatar>
                            <AvatarFallback className="bg-primary text-white">
                              {thread.borrower?.full_name?.charAt(0) || 'B'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {thread.borrower?.full_name || 'Unknown Borrower'}
                            </p>
                            <p className="text-xs text-gray-600 truncate">
                              to: {thread.lender?.business_name || thread.lender?.full_name || 'Unknown Lender'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-1">
                          <Badge className={
                            thread.status === 'active' ? 'bg-green-100 text-green-800' :
                            thread.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }>
                            {thread.status}
                          </Badge>
                          {thread.flagged_count > 0 && (
                            <Badge className="bg-red-100 text-red-800">
                              <Flag className="h-3 w-3 mr-1" />
                              {thread.flagged_count}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{thread.message_count} messages</span>
                        <span>{format(new Date(thread.last_message_at), 'MMM dd, HH:mm')}</span>
                      </div>
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
                <Eye className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Select a conversation to review</p>
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
                      <span>
                        {selectedThread.borrower?.full_name || 'Unknown'} &rarr; {selectedThread.lender?.business_name || selectedThread.lender?.full_name || 'Unknown'}
                      </span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {selectedThread.loan_requests?.purpose || 'Loan Discussion'} |{' '}
                      {selectedThread.message_count} messages |{' '}
                      {selectedThread.flagged_count} flagged
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    {selectedThread.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closeThread(selectedThread.id)}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Close Thread
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteThread(selectedThread.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Thread
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Messages */}
              <CardContent className="p-4">
                <div className="h-[450px] overflow-y-auto space-y-4">
                  {messages.map((message) => {
                    const isLender = message.sender_type === 'lender'
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isLender ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-4 py-2 ${
                            message.flagged_as_spam
                              ? 'bg-red-100 border-2 border-red-300'
                              : isLender
                              ? 'bg-blue-100 text-gray-900'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-600">
                              {isLender ? 'Lender' : 'Borrower'}
                            </span>
                            <div className="flex space-x-1">
                              {message.flagged_as_spam && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2"
                                  onClick={() => unflagMessage(message.id)}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Unflag
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => deleteMessage(message.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {message.flagged_as_spam && (
                            <Alert className="mb-2 bg-red-50 border-red-200 py-1">
                              <AlertTriangle className="h-3 w-3 text-red-600" />
                              <AlertDescription className="text-xs text-red-700">
                                Flagged for potential spam/sensitive content
                              </AlertDescription>
                            </Alert>
                          )}
                          <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-500">
                              {format(new Date(message.created_at), 'MMM dd, HH:mm')}
                            </p>
                            {message.read_at && (
                              <span className="text-xs text-gray-500">Read</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <Alert className="mt-4">
                  <Shield className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Admin view - Read-only access to all platform messages for moderation purposes.
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
