import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  TrendingUp,
  Star,
  CheckCircle,
  LogIn,
  UserPlus,
  Users,
  Clock,
  Award
} from 'lucide-react'

export default function BorrowerLandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg" />
              <span className="text-xl font-bold">Credlio</span>
            </Link>
            <div className="flex items-center space-x-3">
              <Link href="/">
                <Button variant="ghost" size="sm">For Lenders</Button>
              </Link>
              <Link href="/b/login">
                <Button variant="ghost" size="sm">
                  <LogIn className="h-4 w-4 mr-2" />
                  Borrower Sign In
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
                <Award className="w-3 h-3 mr-2" />
                Your Reputation is Your Power
              </Badge>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
              Pay On Time.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                Build Trust.
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-xl sm:text-2xl text-gray-600 max-w-3xl mx-auto">
              Every lender in the network sees your repayment history. Good borrowers get better rates and faster approvals.
            </p>

            {/* Value Proposition Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-2xl mx-auto">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                <div className="text-left">
                  <p className="text-blue-900 font-medium">How It Benefits You:</p>
                  <p className="text-blue-700 text-sm mt-1">
                    When you repay on time, lenders report it. Your credit score goes up. Next time you need a loan,
                    lenders see your good history and offer you better terms.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link href="/b/register">
                <Button size="lg" className="w-full sm:w-auto px-8">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Build Your Credit Profile
                </Button>
              </Link>
              <Link href="/b/login">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-8 pt-8">
              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium">Seen by All Lenders</span>
              </div>

              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <span className="text-sm font-medium">Score Goes Up With Good Behavior</span>
              </div>

              <div className="flex items-center space-x-2 text-gray-600">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Shield className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-sm font-medium">Your Data is Protected</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How Credit Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How Your Credit Score Works</h2>
            <p className="text-lg text-gray-600">Simple: Pay on time = Score goes up. Pay late = Score goes down.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-3xl mx-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-900">Pay on time or early</p>
                  <p className="text-green-700 text-sm">Your score increases. Lenders see you as reliable.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-yellow-50 rounded-lg">
                <Clock className="h-8 w-8 text-yellow-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-900">Pay a few days late</p>
                  <p className="text-yellow-700 text-sm">Small penalty to your score. Pay quickly to minimize damage.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-red-50 rounded-lg">
                <Star className="h-8 w-8 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-900">Don't pay at all</p>
                  <p className="text-red-700 text-sm">Lender reports you as defaulter. All lenders in the country will see this.</p>
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
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Why Build Credit on Credlio?</h2>
            <p className="text-lg text-gray-600">Your good reputation opens doors</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold">Access More Lenders</h3>
              <p className="text-gray-600 text-sm">
                All lenders in the network can see your score. Good score = more options.
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold">Better Loan Terms</h3>
              <p className="text-gray-600 text-sm">
                Higher scores mean lower interest rates and larger loan amounts.
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto">
                <Award className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">Faster Approvals</h3>
              <p className="text-gray-600 text-sm">
                Lenders trust borrowers with proven track records. Get approved faster.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Get Started in Minutes</h2>
            <p className="text-lg text-gray-600">Build your credit profile today</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h3 className="text-xl font-semibold">Register</h3>
              <p className="text-gray-600 text-sm">
                Create your profile with your ID and phone number
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h3 className="text-xl font-semibold">Verify</h3>
              <p className="text-gray-600 text-sm">
                Take a selfie with your ID to prove your identity
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="text-xl font-semibold">Borrow</h3>
              <p className="text-gray-600 text-sm">
                Request loans and receive offers from lenders
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-white">4</span>
              </div>
              <h3 className="text-xl font-semibold">Build Credit</h3>
              <p className="text-gray-600 text-sm">
                Repay on time and watch your score grow
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg" />
              <span className="font-semibold">Credlio</span>
            </div>

            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600">
              <Link href="/" className="hover:text-gray-900">For Lenders</Link>
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
