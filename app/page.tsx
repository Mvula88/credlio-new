import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  TrendingUp,
  CheckCircle,
  LogIn,
  UserPlus,
  Users,
  AlertTriangle,
  Search,
  Database,
  Ban,
  HandshakeIcon
} from 'lucide-react'

export default function LenderLandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-green-600 to-blue-600 rounded-lg" />
              <span className="text-xl font-bold">Credlio</span>
            </Link>
            <div className="flex items-center space-x-3">
              <Link href="/borrower">
                <Button variant="ghost" size="sm">For Borrowers</Button>
              </Link>
              <Link href="/l/login">
                <Button variant="ghost" size="sm">
                  <LogIn className="h-4 w-4 mr-2" />
                  Lender Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center space-y-8">
            {/* Badge */}
            <div className="flex justify-center">
              <Badge variant="outline" className="px-4 py-1.5 text-sm">
                <Users className="w-3 h-3 mr-2" />
                Lenders Protecting Lenders
              </Badge>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
              Stop Borrowers Who{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600">
                Borrow & Run
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-xl sm:text-2xl text-gray-600 max-w-3xl mx-auto">
              A shared database where lenders report defaulters. If a borrower runs from one lender, every lender knows instantly.
            </p>

            {/* Problem Statement */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-2xl mx-auto">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
                <div className="text-left">
                  <p className="text-red-900 font-medium">The Problem You Know Too Well:</p>
                  <p className="text-red-700 text-sm mt-1">
                    A borrower takes money from you and disappears. Then they go to another lender and do the same thing.
                    Without shared information, bad borrowers keep winning.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link href="/l/register">
                <Button size="lg" className="w-full sm:w-auto px-8">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Join the Network
                </Button>
              </Link>
              <Link href="/l/login">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-8 pt-8">
              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Database className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-sm font-medium">Shared Borrower Database</span>
              </div>

              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium">Real-time Updates</span>
              </div>

              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <HandshakeIcon className="h-5 w-5 text-purple-600" />
                </div>
                <span className="text-sm font-medium">Community-Driven</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-green-50 to-blue-50">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How Lenders Protect Each Other</h2>
            <p className="text-lg text-gray-600">When one lender reports, every lender benefits</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-3xl mx-auto">
            <div className="space-y-6">
              {/* Before */}
              <div className="flex items-start gap-4 p-4 bg-red-50 rounded-lg">
                <Ban className="h-8 w-8 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-900">Without Credlio:</p>
                  <p className="text-red-700 text-sm">
                    Borrower defaults on Lender A → Goes to Lender B → Gets another loan → Defaults again → Repeat
                  </p>
                </div>
              </div>

              {/* After */}
              <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-900">With Credlio:</p>
                  <p className="text-green-700 text-sm">
                    Borrower defaults on Lender A → Lender A reports to Credlio → Borrower goes to Lender B →
                    Lender B checks Credlio → <strong>Sees the flag → Rejects borrower</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built By Lenders, For Lenders</h2>
            <p className="text-lg text-gray-600">Every feature designed to protect your money</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto">
                <Search className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">Instant Borrower Lookup</h3>
              <p className="text-gray-600 text-sm">
                Enter phone number or ID → See their full history with other lenders in seconds
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mx-auto">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Report Defaulters</h3>
              <p className="text-gray-600 text-sm">
                Flag borrowers who don't pay. Your report protects every lender in the network.
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold">Credit Scores That Update</h3>
              <p className="text-gray-600 text-sm">
                Late payments automatically lower scores. Good borrowers build positive history.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-gray-600">Protect yourself before you lend</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-blue-600 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h3 className="text-xl font-semibold">Check Before You Lend</h3>
              <p className="text-gray-600">
                Someone asks for a loan? Search their phone number or ID first. See if other lenders flagged them.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-blue-600 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h3 className="text-xl font-semibold">Track Your Loans</h3>
              <p className="text-gray-600">
                Record your loans in Credlio. The system automatically tracks repayments and flags late payers.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-blue-600 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="text-xl font-semibold">Report Bad Borrowers</h3>
              <p className="text-gray-600">
                If someone doesn't pay, report them. Now every lender in your country can see the warning.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Community */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900 text-white">
        <div className="container mx-auto max-w-5xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">The More Lenders Join, The Safer Everyone Gets</h2>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
            Every lender who joins adds their data. Every report makes the database stronger.
            Together, we make it impossible for bad borrowers to hide.
          </p>
          <Link href="/l/register">
            <Button size="lg" variant="secondary" className="px-8">
              <Users className="h-4 w-4 mr-2" />
              Join the Lender Network
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-green-600 to-blue-600 rounded-lg" />
              <span className="font-semibold">Credlio</span>
            </div>

            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600">
              <Link href="/borrower" className="hover:text-gray-900">For Borrowers</Link>
              <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-900">Terms</Link>
              <Link href="/contact" className="hover:text-gray-900">Contact</Link>
            </div>

            <p className="text-sm text-gray-600">© 2024 Credlio. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
