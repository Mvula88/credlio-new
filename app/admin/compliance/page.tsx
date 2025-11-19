'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { FileCheck, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'

export default function CompliancePage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Compliance</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Ensure regulatory compliance • {format(new Date(), 'MMMM dd, yyyy')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compliance Checklist</CardTitle>
          <CardDescription>
            Ensure platform compliance with financial regulations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                <Checkbox checked />
                <div>
                  <p className="font-medium">AML/KYC Procedures</p>
                  <p className="text-sm text-gray-600">Anti-money laundering checks active</p>
                </div>
              </div>
              <Badge className="bg-green-100 text-green-800">Compliant</Badge>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                <Checkbox checked />
                <div>
                  <p className="font-medium">Data Protection (GDPR)</p>
                  <p className="text-sm text-gray-600">User data encryption and privacy</p>
                </div>
              </div>
              <Badge className="bg-green-100 text-green-800">Compliant</Badge>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                <Checkbox checked />
                <div>
                  <p className="font-medium">Interest Rate Compliance</p>
                  <p className="text-sm text-gray-600">Within regulatory limits</p>
                </div>
              </div>
              <Badge className="bg-green-100 text-green-800">Compliant</Badge>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                <Checkbox checked />
                <div>
                  <p className="font-medium">Consumer Protection</p>
                  <p className="text-sm text-gray-600">Fair lending practices enforced</p>
                </div>
              </div>
              <Badge className="bg-green-100 text-green-800">Compliant</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Recent compliance activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <FileCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Audit trail will be populated as compliance actions are performed</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
