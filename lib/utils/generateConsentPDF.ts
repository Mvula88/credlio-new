import jsPDF from 'jspdf'

interface ConsentData {
  mandate_reference: string
  borrower_name: string
  lender_business_name: string
  amount: number
  currency: string
  frequency: string
  deduction_day: number
  start_date: string
  loan_amount: number
  loan_balance: number
  consent_date: string
  borrower_signature?: string
}

export function generateConsentPDF(data: ConsentData): jsPDF {
  const doc = new jsPDF()

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - (margin * 2)
  let y = 20

  // Header
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('AUTOMATIC PAYMENT DEDUCTION CONSENT', pageWidth / 2, y, { align: 'center' })
  y += 15

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Reference: ${data.mandate_reference}`, pageWidth / 2, y, { align: 'center' })
  y += 15

  // Introduction
  doc.setFontSize(11)
  const intro = `This consent form authorizes ${data.lender_business_name} to deduct payments automatically from my payment card for loan repayment purposes.`
  const introLines = doc.splitTextToSize(intro, contentWidth)
  doc.text(introLines, margin, y)
  y += (introLines.length * 7) + 10

  // Borrower Details
  doc.setFont('helvetica', 'bold')
  doc.text('BORROWER DETAILS', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.text(`Full Name: ${data.borrower_name}`, margin, y)
  y += 7
  doc.text(`Date of Consent: ${new Date(data.consent_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y)
  y += 12

  // Lender Details
  doc.setFont('helvetica', 'bold')
  doc.text('LENDER DETAILS', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.text(`Business Name: ${data.lender_business_name}`, margin, y)
  y += 12

  // Loan Details
  doc.setFont('helvetica', 'bold')
  doc.text('LOAN DETAILS', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.text(`Original Loan Amount: ${data.currency} ${data.loan_amount.toFixed(2)}`, margin, y)
  y += 7
  doc.text(`Current Outstanding Balance: ${data.currency} ${data.loan_balance.toFixed(2)}`, margin, y)
  y += 12

  // Deduction Details
  doc.setFont('helvetica', 'bold')
  doc.text('DEDUCTION DETAILS', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')

  const frequencyLabels: Record<string, string> = {
    weekly: 'Weekly',
    biweekly: 'Every 2 Weeks',
    monthly: 'Monthly'
  }

  doc.text(`Deduction Amount: ${data.currency} ${data.amount.toFixed(2)}`, margin, y)
  y += 7
  doc.text(`Frequency: ${frequencyLabels[data.frequency] || data.frequency}`, margin, y)
  y += 7
  doc.text(`First Deduction Date: ${new Date(data.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y)
  y += 12

  // Terms and Conditions
  doc.setFont('helvetica', 'bold')
  doc.text('TERMS AND CONDITIONS', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  const terms = [
    '1. I authorize the lender to deduct the specified amount from my payment card on the scheduled dates.',
    '2. I understand that deductions will continue until my loan is fully repaid or I revoke this authorization.',
    '3. I will ensure sufficient funds are available on my card for each deduction.',
    '4. I understand that failed deductions may result in late fees and affect my credit score.',
    '5. I can revoke this authorization at any time by contacting the lender in writing.',
    '6. The lender will notify me before each deduction via SMS or email.',
    '7. My card details are securely stored and encrypted by the payment processor.',
    '8. A platform fee of 2% will be deducted from each payment for processing.',
    '9. I have read and understood all terms and conditions of this agreement.',
    '10. This authorization remains valid until the loan is fully repaid or I revoke it.'
  ]

  terms.forEach(term => {
    const termLines = doc.splitTextToSize(term, contentWidth)
    if (y + (termLines.length * 5) > 270) {
      doc.addPage()
      y = 20
    }
    doc.text(termLines, margin, y)
    y += (termLines.length * 5) + 3
  })

  y += 10

  // Signature Section
  if (y > 240) {
    doc.addPage()
    y = 20
  }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('BORROWER CONSENT', margin, y)
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  const consent = 'By signing below, I acknowledge that I have read, understood, and agree to the terms and conditions outlined in this consent form. I authorize automatic payment deductions as specified above.'
  const consentLines = doc.splitTextToSize(consent, contentWidth)
  doc.text(consentLines, margin, y)
  y += (consentLines.length * 5) + 15

  // Signature Line
  doc.setLineWidth(0.5)
  doc.line(margin, y, margin + 70, y)
  y += 7
  doc.setFontSize(9)
  doc.text('Borrower Signature', margin, y)

  doc.line(pageWidth - margin - 70, y - 7, pageWidth - margin, y - 7)
  doc.text('Date', pageWidth - margin - 70, y)

  if (data.borrower_signature) {
    // If digital signature is provided, add it
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(12)
    doc.text(data.borrower_signature, margin + 35, y - 10, { align: 'center' })
  }

  y += 20

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(128, 128, 128)
  const footer = 'This is a legally binding agreement. Keep a copy for your records.'
  doc.text(footer, pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.text('Powered by Credlio - Secure Lending Platform', pageWidth / 2, y, { align: 'center' })

  // Add watermark
  doc.setFontSize(50)
  doc.setTextColor(200, 200, 200)
  doc.text('CREDLIO', pageWidth / 2, 150, {
    align: 'center',
    angle: 45
  })

  return doc
}

export function downloadConsentPDF(data: ConsentData, filename?: string) {
  const doc = generateConsentPDF(data)
  const name = filename || `Consent_${data.mandate_reference}_${Date.now()}.pdf`
  doc.save(name)
}

export function getConsentPDFBase64(data: ConsentData): string {
  const doc = generateConsentPDF(data)
  return doc.output('dataurlstring')
}
