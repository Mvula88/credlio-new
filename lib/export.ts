/**
 * Export utilities for generating CSV and other file formats
 */

export function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) {
    throw new Error('No data to export')
  }

  // Get headers from first object
  const headers = Object.keys(data[0])

  // Create CSV content
  const csvContent = [
    // Header row
    headers.join(','),
    // Data rows
    ...data.map(row =>
      headers.map(header => {
        const value = row[header]
        // Handle values that might contain commas or quotes
        if (value === null || value === undefined) return ''
        const stringValue = String(value)
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      }).join(',')
    )
  ].join('\n')

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

export function formatBorrowerForExport(borrower: any) {
  return {
    'Full Name': borrower.full_name || '',
    'Phone': borrower.phone_e164 || '',
    'Date of Birth': borrower.date_of_birth || '',
    'Country': borrower.country_code || '',
    'Credit Score': borrower.borrower_scores?.[0]?.score || 'N/A',
    'Total Loans': borrower.total_loans || 0,
    'Active Loan': borrower.active_loan ? 'Yes' : 'No',
    'Risk Flags': borrower.risk_flags_count || 0,
    'Created At': borrower.created_at ? new Date(borrower.created_at).toLocaleDateString() : '',
  }
}

export function formatLoanForExport(loan: any) {
  return {
    'Loan ID': loan.id?.slice(0, 8) || '',
    'Borrower': loan.borrowers?.full_name || '',
    'Principal': (loan.principal_minor || 0) / 100,
    'Total Due': (loan.total_minor || 0) / 100,
    'Currency': loan.currency || '',
    'Interest Rate': ((loan.apr_bps || 0) / 100).toFixed(2) + '%',
    'Term (months)': loan.term_months || 0,
    'Status': loan.status || '',
    'Disbursed': loan.disbursement_date ? new Date(loan.disbursement_date).toLocaleDateString() : '',
    'Created': loan.created_at ? new Date(loan.created_at).toLocaleDateString() : '',
  }
}

export function formatPaymentForExport(payment: any) {
  return {
    'Payment ID': payment.id?.slice(0, 8) || '',
    'Borrower': payment.loans?.borrowers?.full_name || '',
    'Amount': (payment.amount_minor || 0) / 100,
    'Payment Date': payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : '',
    'Notes': payment.notes || '',
    'Recorded': payment.created_at ? new Date(payment.created_at).toLocaleDateString() : '',
  }
}
