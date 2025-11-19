'use client'

import { useState } from 'react'
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
  LayoutDashboard,
  Users,
  FileText,
  ShieldAlert,
  FileCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  Bell,
  ChevronDown,
  Scale,
  AlertTriangle,
  UserCheck,
  Globe,
  FileSignature
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RoleSwitcher } from '@/components/RoleSwitcher'

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Countries', href: '/admin/countries', icon: Globe },
  { name: 'User Management', href: '/admin/users', icon: Users },
  { name: 'Verifications', href: '/admin/verifications', icon: UserCheck },
  { name: 'Risk Management', href: '/admin/risk', icon: ShieldAlert },
  { name: 'Loan Agreements', href: '/admin/agreements', icon: FileSignature },
  { name: 'Compliance', href: '/admin/compliance', icon: FileCheck },
  { name: 'Disputes', href: '/admin/disputes', icon: Scale },
  { name: 'Fraud Signals', href: '/admin/fraud', icon: AlertTriangle },
  { name: 'Reports', href: '/admin/reports', icon: FileText },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  // Public pages that should not have sidebar
  const publicPages = ['/admin/login', '/admin/register', '/admin/forgot-password', '/admin/reset-password']
  const isPublicPage = publicPages.includes(pathname)

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
            <Link href="/admin/dashboard" className="flex items-center space-x-2" onClick={() => setSidebarOpen(false)}>
              <Shield className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-sidebar-foreground">Credlio</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mobile Navigation - Scrollable Area */}
          <nav className="flex-1 mt-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden pb-6 min-h-0">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "group flex items-center space-x-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                  pathname === item.href
                    ? "bg-sidebar-accent text-sidebar-primary shadow-lg shadow-primary/20"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                {pathname === item.href && (
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent"></div>
                )}
                <item.icon className={cn(
                  "h-5 w-5 transition-all duration-300",
                  pathname === item.href
                    ? "text-primary"
                    : "text-sidebar-foreground/50 group-hover:text-primary"
                )} />
                <span className="relative">{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
          {/* Logo Section */}
          <div className="flex h-16 items-center px-6 border-b border-sidebar-border flex-shrink-0">
            <Link href="/admin/dashboard" className="flex items-center space-x-3 group">
              <div className="relative w-9 h-9 bg-gradient-to-br from-primary via-secondary to-accent rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 rounded-xl blur-md group-hover:blur-lg transition-all" />
                <Shield className="absolute inset-0 m-auto h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Admin Panel
              </span>
            </Link>
          </div>

          {/* Navigation - Scrollable Area */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto overflow-x-hidden min-h-0">
            {navigation.map((item) => (
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
              </Link>
            ))}
          </nav>

          {/* Footer with Admin Badge */}
          <div className="p-4 border-t border-sidebar-border bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="px-3 py-1 bg-gradient-to-r from-primary to-secondary text-white text-xs font-semibold rounded-full shadow-lg">
                ADMIN
              </span>
            </div>
            <div className="text-xs text-sidebar-foreground/50 text-center">
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
              {/* Notifications */}
              <Button variant="ghost" size="icon" className="relative hover:bg-accent/50 transition-all duration-300 hover:scale-105">
                <Bell className="h-5 w-5" />
                <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full animate-pulse"></span>
              </Button>

              {/* Role Switcher - shows when user has multiple roles */}
              <RoleSwitcher />

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2 hover:bg-accent/50 transition-all duration-300">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                      <Shield className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-effect border-border/50">
                  <DropdownMenuLabel className="text-foreground">Admin Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/admin/settings')} className="cursor-pointer hover:bg-accent/50">
                    <Settings className="mr-2 h-4 w-4 text-primary" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/admin/profile')} className="cursor-pointer hover:bg-accent/50">
                    <UserCheck className="mr-2 h-4 w-4 text-primary" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer hover:bg-destructive/10 text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main>
          {children}
        </main>
      </div>
    </div>
  )
}
