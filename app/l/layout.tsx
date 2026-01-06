'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Users,
  CreditCard,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  ShoppingBag,
  Bell,
  ChevronDown,
  Flag,
  Calculator,
  MessageSquare,
  ShieldCheck,
  Wallet,
  Landmark,
  Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import NotificationBell from '@/components/NotificationBell'
import ProfileCompletionBanner from '@/components/ProfileCompletionBanner'

interface NavigationItem {
  name: string
  href: string
  icon: any
  badge: string | null
  proPlusOnly?: boolean
  businessOnly?: boolean
}

interface NavigationGroup {
  title: string
  items: NavigationItem[]
}

const navigationGroups: NavigationGroup[] = [
  {
    title: 'Dashboard',
    items: [
      { name: 'Overview', href: '/l/overview', icon: BarChart3, badge: null },
    ]
  },
  {
    title: 'Operations',
    items: [
      { name: 'Borrowers', href: '/l/borrowers', icon: Users, badge: null },
    ]
  },
  {
    title: 'Lending Activity',
    items: [
      { name: 'Loans', href: '/l/loans', icon: CreditCard, badge: null },
      { name: 'Repayments', href: '/l/repayments', icon: Wallet, badge: null },
      { name: 'Collections', href: '/l/collections', icon: Landmark, badge: null },
    ]
  },
  {
    title: 'Risk & Compliance',
    items: [
      { name: 'Affordability Check', href: '/l/affordability', icon: Wallet, badge: null },
      { name: 'Document Verification', href: '/l/verification', icon: ShieldCheck, badge: null },
    ]
  },
  {
    title: 'Insights',
    items: [
      { name: 'Credit Intelligence', href: '/l/reports', icon: Flag, badge: null },
      { name: 'Loan Requests', href: '/l/marketplace', icon: ShoppingBag, badge: null, proPlusOnly: false },
    ]
  },
  {
    title: 'Settings',
    items: [
      { name: 'Settings', href: '/l/settings', icon: Settings, badge: null },
    ]
  },
]

export default function LenderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [lenderTier, setLenderTier] = useState<string>('FREE')
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // Prevent hydration mismatch with Radix UI
  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch lender tier
  useEffect(() => {
    const fetchTier = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: tierData } = await supabase.rpc('get_effective_tier', {
        p_user_id: user.id
      })
      if (tierData) {
        setLenderTier(tierData)
      }
    }
    fetchTier()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/l/login')
  }

  // Public pages that should not have sidebar (includes all auth/onboarding pages)
  const publicPages = [
    '/l/login',
    '/l/register',
    '/l/register/confirm-email',
    '/l/forgot-password',
    '/l/reset-password',
    '/l/complete-profile'
  ]
  const isPublicPage = publicPages.some(page => pathname.startsWith(page))

  // If it's a public page, just render children without sidebar
  if (isPublicPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Mobile sidebar */}
      <div className={cn(
        "fixed inset-0 z-50 lg:hidden transition-opacity duration-300",
        sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        <div className={cn(
          "fixed inset-y-0 left-0 w-64 bg-sidebar shadow-2xl transition-transform duration-300 flex flex-col",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Mobile Header */}
          <div className="flex h-16 items-center justify-between px-6 border-b border-sidebar-border flex-shrink-0">
            <Link href="/l/overview" className="flex items-center space-x-2" onClick={() => setSidebarOpen(false)}>
              <Building2 className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-sidebar-foreground">Credlio</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mobile Navigation - Scrollable Area */}
          <nav className="sidebar-nav flex-1 mt-6 px-3 space-y-6 overflow-y-auto overflow-x-hidden pb-6 min-h-0">
            {navigationGroups.map((group) => (
              <div key={group.title}>
                <h3 className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "group flex items-center space-x-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        pathname === item.href
                          ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                      )}
                    >
                      <item.icon className={cn(
                        "h-5 w-5 transition-all duration-300",
                        pathname === item.href
                          ? "text-white"
                          : "text-sidebar-foreground/50 group-hover:text-primary"
                      )} />
                      <span className="relative">{item.name}</span>
                      {item.badge && (
                        <span className={cn(
                          "ml-auto text-xs px-2 py-0.5 rounded-full shadow-lg",
                          pathname === item.href
                            ? "bg-white/20 text-white"
                            : "bg-gradient-to-r from-primary to-accent text-white"
                        )}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
          {/* Logo Section */}
          <div className="flex h-16 items-center px-6 border-b border-sidebar-border flex-shrink-0">
            <Link href="/l/overview" className="flex items-center space-x-2">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-sidebar-foreground">
                Credlio Lender
              </span>
            </Link>
          </div>

          {/* Navigation - Scrollable Area */}
          <nav className="sidebar-nav flex-1 px-3 py-6 space-y-6 overflow-y-auto overflow-x-hidden min-h-0">
            {navigationGroups.map((group, groupIdx) => (
              <div key={group.title}>
                <h3 className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "group flex items-center space-x-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 relative",
                        pathname === item.href
                          ? "bg-gradient-to-r from-primary to-secondary text-white shadow-md shadow-primary/20"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <item.icon className={cn(
                        "h-5 w-5 transition-all duration-200",
                        pathname === item.href
                          ? "text-white"
                          : "text-sidebar-foreground/50 group-hover:text-primary"
                      )} />
                      <span className="relative">{item.name}</span>
                      {item.badge && (
                        <span className={cn(
                          "ml-auto text-xs px-2 py-0.5 rounded-full",
                          pathname === item.href
                            ? "bg-white/20 text-white"
                            : "bg-primary text-white"
                        )}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
                {groupIdx < navigationGroups.length - 1 && (
                  <div className="mt-4 border-t border-sidebar-border/50"></div>
                )}
              </div>
            ))}
          </nav>

          {/* Footer with Gradient Accent */}
          <div className="p-4 border-t border-sidebar-border relative overflow-hidden flex-shrink-0">
            <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent"></div>
            <div className="text-xs text-sidebar-foreground/50 text-center relative">
              Powered by <span className="text-primary font-semibold">Credlio</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top navigation */}
        <header className="sticky top-0 z-40 glass-effect border-b border-border/50 shadow-sm">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              className="lg:hidden p-2 hover:bg-accent/50 rounded-lg transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6 text-foreground" />
            </button>

            <div className="flex items-center space-x-2 ml-auto">
              {/* Notifications & Messages */}
              <NotificationBell userRole="lender" />

              {/* Role Switcher - shows when user has multiple roles */}
              <RoleSwitcher />

              {/* User menu */}
              {mounted ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2 hover:bg-accent/50 transition-all duration-300">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                      <Building2 className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-effect border-border/50">
                  <DropdownMenuLabel className="text-foreground">My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/l/settings')} className="cursor-pointer hover:bg-accent/50">
                    <Settings className="mr-2 h-4 w-4 text-primary" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/l/billing')} className="cursor-pointer hover:bg-accent/50">
                    <CreditCard className="mr-2 h-4 w-4 text-primary" />
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer hover:bg-destructive/10 text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              ) : (
                <Button variant="ghost" className="flex items-center space-x-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="py-6">
          <div className="mx-auto px-4 sm:px-6 lg:px-8">
            {/* Profile completion banner - prompts user to complete missing steps */}
            <ProfileCompletionBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}