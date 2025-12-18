import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get lender profile
    const { data: lender, error: lenderError } = await supabase
      .from('lenders')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (lenderError) {
      return NextResponse.json({ error: 'Lender not found' }, { status: 404 })
    }

    // Get profile data (for syncing name, phone)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, phone_e164')
      .eq('user_id', user.id)
      .single()

    // Merge profile data with lender data
    // If lender doesn't have contact_number/email yet, use profile data
    const mergedLender = {
      ...lender,
      // Pre-fill contact_number from profile phone if not set
      contact_number: lender.contact_number || profile?.phone_e164 || '',
      // Pre-fill email from auth user email if not set in lender
      email: lender.email || user.email || '',
      // Include profile data for reference
      profile_full_name: profile?.full_name,
      profile_phone: profile?.phone_e164
    }

    return NextResponse.json({ lender: mergedLender })
  } catch (error) {
    console.error('Error fetching provider info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch provider information' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a lender
    const { data: profile } = await supabase
      .from('profiles')
      .select('app_role')
      .eq('user_id', user.id)
      .single()

    if (profile?.app_role !== 'lender') {
      return NextResponse.json({ error: 'Only lenders can update provider info' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const {
      businessName,
      registrationNumber,
      physicalAddress,
      postalAddress,
      contactNumber,
      email,
      website,
      businessType,
      yearsInOperation,
      description,
      serviceAreas
    } = body

    // Validate required fields
    if (!businessName || !physicalAddress || !contactNumber || !email || !businessType || !serviceAreas || serviceAreas.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Update lender record
    const { data: lender, error: updateError } = await supabase
      .from('lenders')
      .update({
        business_name: businessName,
        registration_number: registrationNumber,
        physical_address: physicalAddress,
        postal_address: postalAddress,
        contact_number: contactNumber,
        email: email,
        website: website,
        business_type: businessType,
        years_in_operation: yearsInOperation ? parseInt(yearsInOperation) : null,
        description: description,
        service_areas: serviceAreas,
        profile_completed: true
      })
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update provider information' },
        { status: 500 }
      )
    }

    // Also sync phone to profiles table if it's different
    // This keeps the contact info in sync across tables
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('phone_e164')
      .eq('user_id', user.id)
      .single()

    // Only update profile phone if it's empty and we have a contact number
    if (!currentProfile?.phone_e164 && contactNumber) {
      await supabase
        .from('profiles')
        .update({ phone_e164: contactNumber })
        .eq('user_id', user.id)
    }

    return NextResponse.json({
      success: true,
      lender
    })
  } catch (error) {
    console.error('Error saving provider info:', error)
    return NextResponse.json(
      { error: 'Failed to save provider information' },
      { status: 500 }
    )
  }
}
