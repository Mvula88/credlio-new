'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Building2, UserCircle, ChevronDown, RefreshCw, Shield } from 'lucide-react'

interface UserRole {
  role: string
  created_at: string
}

export function RoleSwitcher() {
  const [roles, setRoles] = useState<string[]>([])
  const [currentRole, setCurrentRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchUserRoles() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setLoading(false)
          return
        }

        // Fetch user roles from user_roles table
        const { data: userRoles, error } = await supabase
          .from('user_roles')
          .select('role, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })

        if (error) {
          console.error('Error fetching roles:', error)
          setLoading(false)
          return
        }

        const rolesList = userRoles?.map(r => r.role) || []
        setRoles(rolesList)

        // Detect current role from URL
        const path = window.location.pathname
        if (path.startsWith('/l/')) {
          setCurrentRole('lender')
        } else if (path.startsWith('/b/')) {
          setCurrentRole('borrower')
        } else if (path.startsWith('/admin/') || path.startsWith('/a/')) {
          setCurrentRole('admin')
        }

        setLoading(false)
      } catch (error) {
        console.error('Error:', error)
        setLoading(false)
      }
    }

    fetchUserRoles()
  }, [supabase])

  // Only show if user has multiple roles
  if (loading || roles.length <= 1) {
    return null
  }

  const switchRole = (targetRole: string) => {
    if (targetRole === 'lender') {
      router.push('/l/overview')
    } else if (targetRole === 'borrower') {
      router.push('/b/overview')
    } else if (targetRole === 'admin') {
      router.push('/admin/dashboard')
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'lender':
        return <Building2 className="h-4 w-4" />
      case 'borrower':
        return <UserCircle className="h-4 w-4" />
      case 'admin':
        return <Shield className="h-4 w-4" />
      default:
        return <UserCircle className="h-4 w-4" />
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'lender':
        return 'Lender'
      case 'borrower':
        return 'Borrower'
      case 'admin':
        return 'Admin'
      default:
        return role.charAt(0).toUpperCase() + role.slice(1)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 glass-effect hover:bg-accent/10 transition-all duration-300">
          {getRoleIcon(currentRole)}
          <span className="font-medium">{getRoleLabel(currentRole)}</span>
          <Badge variant="secondary" className="ml-1 text-xs">
            {roles.length}
          </Badge>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 glass-effect">
        <DropdownMenuLabel className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Switch Role
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((role) => (
          <DropdownMenuItem
            key={role}
            onClick={() => switchRole(role)}
            disabled={role === currentRole}
            className="gap-2 cursor-pointer"
          >
            {getRoleIcon(role)}
            <span>{getRoleLabel(role)} Dashboard</span>
            {role === currentRole && (
              <Badge variant="default" className="ml-auto text-xs">
                Current
              </Badge>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          You have {roles.length} active {roles.length === 1 ? 'role' : 'roles'}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
