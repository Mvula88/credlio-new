import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const documentType = formData.get('documentType') as string

    if (!file || !documentType) {
      return NextResponse.json(
        { error: 'Missing file or document type' },
        { status: 400 }
      )
    }

    // Validate file type and size
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    const maxSize = 5 * 1024 * 1024 // 5MB

    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPG, PNG, and PDF allowed.' },
        { status: 400 }
      )
    }

    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      )
    }

    // Get borrower record
    const { data: borrower } = await supabase
      .from('borrowers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!borrower) {
      return NextResponse.json(
        { error: 'Borrower profile not found' },
        { status: 404 }
      )
    }

    // Upload file to Supabase Storage
    const fileName = `${user.id}/${documentType}_${Date.now()}.${file.name.split('.').pop()}`
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('kyc-documents')
      .getPublicUrl(fileName)

    // Calculate SHA-256 hash of file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const crypto = await import('crypto')
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')

    // Save document record using document_hashes table
    const { data: document, error: dbError } = await supabase
      .from('document_hashes')
      .insert({
        borrower_id: borrower.id,
        document_type: documentType,
        document_sha256: hash,
        storage_path: fileName,
        uploaded_at: new Date().toISOString()
      })
      .select()
      .single()

    if (dbError) {
      // Clean up uploaded file if database insert fails
      await supabase.storage
        .from('kyc-documents')
        .remove([fileName])
      
      return NextResponse.json(
        { error: 'Failed to save document record' },
        { status: 500 }
      )
    }

    // Update borrower KYC status to pending if not already
    await supabase
      .from('borrowers')
      .update({ 
        kyc_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', borrower.id)
      .eq('kyc_status', 'unverified')

    return NextResponse.json({ 
      success: true,
      document 
    })
  } catch (error) {
    console.error('KYC upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get borrower's KYC documents
    const { data: borrower } = await supabase
      .from('borrowers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!borrower) {
      return NextResponse.json(
        { error: 'Borrower profile not found' },
        { status: 404 }
      )
    }

    const { data: documents, error } = await supabase
      .from('document_hashes')
      .select('*')
      .eq('borrower_id', borrower.id)
      .order('uploaded_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('KYC fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}