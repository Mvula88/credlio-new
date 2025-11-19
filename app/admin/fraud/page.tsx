'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AlertTriangle, ShieldAlert, Ban, Activity } from 'lucide-react'
import { format } from 'date-fns'

export default function FraudSignalsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Fraud Detection</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Monitor suspicious activities • {format(new Date(), 'MMMM dd, yyyy')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Fraud Signals</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-red-600">0</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Under Review</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 rounded-xl">
              <ShieldAlert className="h-5 w-5 text-yellow-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-yellow-600">0</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Blocked Accounts</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-gray-500/10 to-gray-500/5 rounded-xl">
              <Ban className="h-5 w-5 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-gray-600">0</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Detection Rate</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl">
              <Activity className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-green-600">99%</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fraud Detection Dashboard</CardTitle>
          <CardDescription>
            AI-powered fraud detection and prevention
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <ShieldAlert className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No fraud signals detected</p>
            <p className="text-sm text-gray-500 mt-2">System is actively monitoring for suspicious patterns and anomalies</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
