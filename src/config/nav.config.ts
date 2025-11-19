import {
  LayoutDashboard,
  Users,
  FileText,
  DollarSign,
  ShieldAlert,
  Store,
  Calculator,
  FileCheck,
  Settings,
  CreditCard,
  AlertTriangle,
  Scale,
  UserCheck,
  TrendingUp,
  UserPlus,
} from 'lucide-react'

export interface NavItem {
  title: string
  href: string
  icon?: any
  badge?: string
  requiredTier?: 'PRO' | 'PRO_PLUS'
  children?: NavItem[]
}

export const lenderNav: NavItem[] = [
  {
    title: 'Overview',
    href: '/l/overview',
    icon: LayoutDashboard,
  },
  {
    title: 'Borrowers',
    href: '/l/borrowers',
    icon: Users,
    children: [
      { title: 'Search & Register', href: '/l/borrowers' },
      { title: 'Risky List', href: '/l/borrowers/risky' },
    ],
  },
  {
    title: 'Loans',
    href: '/l/loans',
    icon: FileText,
  },
  {
    title: 'Repayments',
    href: '/l/repayments',
    icon: DollarSign,
  },
  {
    title: 'Marketplace',
    href: '/l/marketplace',
    icon: Store,
    badge: 'Pro+',
    requiredTier: 'PRO_PLUS',
  },
  {
    title: 'Disputes',
    href: '/l/disputes',
    icon: Scale,
  },
  {
    title: 'Reports',
    href: '/l/reports',
    icon: TrendingUp,
  },
  {
    title: 'Tools',
    href: '/l/tools',
    icon: Calculator,
    children: [
      { title: 'Affordability Calculator', href: '/l/tools/affordability' },
      { title: 'Document Checker', href: '/l/tools/doc-check' },
    ],
  },
]

export const borrowerNav: NavItem[] = [
  {
    title: 'Overview',
    href: '/b/overview',
    icon: LayoutDashboard,
  },
  {
    title: 'My Loans',
    href: '/b/loans',
    icon: FileText,
  },
  {
    title: 'Loan Requests',
    href: '/b/requests',
    icon: UserPlus,
    badge: 'Pro+',
    requiredTier: 'PRO_PLUS',
  },
  {
    title: 'Offers',
    href: '/b/offers',
    icon: DollarSign,
  },
  {
    title: 'Disputes',
    href: '/b/disputes',
    icon: Scale,
  },
  {
    title: 'Profile',
    href: '/b/profile',
    icon: UserCheck,
  },
  {
    title: 'Tools',
    href: '/b/tools',
    icon: Calculator,
    children: [
      { title: 'Affordability Calculator', href: '/b/tools/affordability' },
      { title: 'Document Checker', href: '/b/tools/doc-check' },
    ],
  },
]

export const adminNav: NavItem[] = [
  {
    title: 'Overview',
    href: '/a/overview',
    icon: LayoutDashboard,
  },
  {
    title: 'KYC',
    href: '/a/kyc',
    icon: UserCheck,
  },
  {
    title: 'Risk Management',
    href: '/a/risk',
    icon: ShieldAlert,
  },
  {
    title: 'Compliance',
    href: '/a/compliance',
    icon: FileCheck,
  },
  {
    title: 'Disputes',
    href: '/a/disputes',
    icon: Scale,
  },
  {
    title: 'Fraud Signals',
    href: '/a/fraud',
    icon: AlertTriangle,
  },
  {
    title: 'Settings',
    href: '/a/settings',
    icon: Settings,
  },
]

export function getNavItems(role: 'borrower' | 'lender' | 'admin'): NavItem[] {
  switch (role) {
    case 'borrower':
      return borrowerNav
    case 'lender':
      return lenderNav
    case 'admin':
      return adminNav
    default:
      return []
  }
}