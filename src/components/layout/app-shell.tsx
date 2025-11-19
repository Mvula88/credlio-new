'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ChevronDown,
  LogOut,
  Menu,
  Settings,
  User,
  CreditCard,
  Globe,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { NavItem } from '@/config/nav.config'
import type { AuthUser } from '@/lib/auth'

interface AppShellProps {
  user: AuthUser
  navItems: NavItem[]
  children: React.ReactNode
}

const COUNTRY_NAMES: Record<string, string> = {
  NG: 'Nigeria',
  KE: 'Kenya',
  ZA: 'South Africa',
  GH: 'Ghana',
  TZ: 'Tanzania',
  UG: 'Uganda',
  NA: 'Namibia',
  ZM: 'Zambia',
  MW: 'Malawi',
  RW: 'Rwanda',
  CM: 'Cameroon',
  CI: 'Ivory Coast',
}

export function AppShell({ user, navItems, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const rolePrefix = user.role === 'borrower' ? '/b' : user.role === 'lender' ? '/l' : '/a'
  const roleColor = user.role === 'borrower' ? 'blue' : user.role === 'lender' ? 'green' : 'purple'

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'tech-sidebar fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-6 border-b border-sidebar-border bg-white/80 backdrop-blur-sm">
            <Link href={`${rolePrefix}/overview`} className="flex items-center space-x-3 group">
              <div className="relative w-9 h-9 bg-gradient-to-br from-primary via-secondary to-accent rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 rounded-xl blur-md group-hover:blur-lg transition-all" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Credlio</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="space-y-1 px-3">
              {navItems.map((item) => {
                const isActive = pathname === item.href || 
                  (item.children && item.children.some(child => pathname === child.href))
                
                // Check tier requirements
                if (item.requiredTier && user.tier !== item.requiredTier) {
                  return (
                    <Link
                      key={item.href}
                      href="/upgrade"
                      className="flex items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground rounded-xl hover:bg-sidebar-accent group border border-dashed border-muted-foreground/20"
                    >
                      <div className="flex items-center space-x-3">
                        {item.icon && <item.icon className="h-5 w-5 opacity-50" />}
                        <span className="opacity-70">{item.title}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs bg-gradient-to-r from-accent/80 to-secondary/80 text-white">
                        {item.badge}
                      </Badge>
                    </Link>
                  )
                }

                if (item.children) {
                  return (
                    <div key={item.href}>
                      <button
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200',
                          isActive
                            ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-md shadow-primary/20'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary'
                        )}
                      >
                        <div className="flex items-center space-x-3">
                          {item.icon && <item.icon className="h-5 w-5" />}
                          <span>{item.title}</span>
                        </div>
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <div className="mt-1 space-y-1 pl-11">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              'block px-3 py-2 text-sm rounded-lg transition-all duration-200',
                              pathname === child.href
                                ? 'bg-gradient-to-r from-primary/10 to-secondary/10 text-primary font-medium border-l-2 border-primary'
                                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary hover:translate-x-1'
                            )}
                          >
                            {child.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 group',
                      isActive
                        ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-md shadow-primary/20'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary'
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      {item.icon && <item.icon className={cn("h-5 w-5 transition-transform duration-200", !isActive && "group-hover:scale-110")} />}
                      <span>{item.title}</span>
                    </div>
                    {item.badge && (
                      <Badge variant="secondary" className="text-xs bg-accent text-white">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                )
              })}
            </nav>
          </ScrollArea>

          {/* Bottom section */}
          <div className="border-t border-sidebar-border p-4 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <Badge variant="outline" className="capitalize border-primary/30 text-primary bg-primary/10 font-medium">
                {user.role}
              </Badge>
              <Badge className={cn(
                "font-medium shadow-sm",
                user.tier === 'PRO_PLUS'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-primary/20'
                  : 'bg-gradient-to-r from-secondary to-accent text-white shadow-secondary/20'
              )}>
                {user.tier === 'PRO_PLUS' ? 'Pro+' : 'Pro'}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground font-medium truncate">
              {user.email}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white/80 border-b border-border flex items-center justify-between px-6 backdrop-blur-md shadow-sm">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden hover:bg-primary/10"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Country badge */}
            <div className="flex items-center space-x-2 px-4 py-1.5 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-full border border-primary/20 shadow-sm">
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {COUNTRY_NAMES[user.country] || user.country}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Subscription button */}
            {user.tier === 'PRO' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/upgrade')}
                className="hidden sm:flex"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Upgrade to Pro+
              </Button>
            )}

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 hover:bg-primary/10 group">
                  <div className="relative">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center text-white text-sm font-bold shadow-lg ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all duration-200">
                      {user.profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-gradient-to-br from-accent to-secondary rounded-full border-2 border-white"></div>
                  </div>
                  <ChevronDown className="h-4 w-4 group-hover:text-primary transition-colors" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push(`${rolePrefix}/profile`)}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/billing')}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  )
}