import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { cookies } from 'next/headers'

// Hash function (same as in lib/auth.ts)
function hashNationalId(nationalId: string): string {
  return createHash('sha256').update(nationalId.trim().toLowerCase()).digest('hex')
}

// Encode national ID for admin verification (base64)
function encodeNationalId(nationalId: string): string {
  return Buffer.from(nationalId.trim()).toString('base64')
}

export async function POST(request: NextRequest) {
  try {
    const {
      nationalId, phone, dateOfBirth, userId,
      // Enhanced verification fields
      streetAddress, city, postalCode,
      employmentStatus, employerName, monthlyIncomeRange, incomeSource,
      emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
      nextOfKinName, nextOfKinPhone, nextOfKinRelationship,
      bankName, bankAccountNumber, bankAccountName,
      linkedinUrl, facebookUrl, referrerPhone
    } = await request.json()

    if (!nationalId || !phone || !dateOfBirth || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate enhanced required fields
    if (!streetAddress || !city || !employmentStatus || !monthlyIncomeRange || !incomeSource ||
        !emergencyContactName || !emergencyContactPhone || !emergencyContactRelationship ||
        !nextOfKinName || !nextOfKinPhone || !nextOfKinRelationship ||
        !bankName || !bankAccountNumber || !bankAccountName) {
      return NextResponse.json(
        { error: 'Missing required verification fields' },
        { status: 400 }
      )
    }

    // Create admin client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Use the userId provided from the client
    const user = { id: userId }

    // Get user's profile for country and name
    const { data: profile } = await supabase
      .from('profiles')
      .select('country_code, full_name')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Hash the national ID for searching
    const idHash = hashNationalId(nationalId)
    // Encode the national ID for admin verification
    const idEncoded = encodeNationalId(nationalId)

    // Check if borrower already exists with this ID or phone
    const { data: existingBorrower } = await supabase
      .from('borrowers')
      .select('id')
      .eq('country_code', profile.country_code)
      .or(`national_id_hash.eq.${idHash},phone_e164.eq.${phone}`)
      .single()

    let borrowerId: string

    // Check if has social media
    const hasSocialMedia = !!(linkedinUrl || facebookUrl)

    if (existingBorrower) {
      // Update existing borrower with all enhanced fields
      borrowerId = existingBorrower.id
      await supabase
        .from('borrowers')
        .update({
          full_name: profile.full_name,
          phone_e164: phone,
          date_of_birth: dateOfBirth,
          email_verified: true,
          profile_completed: true,
          national_id_encrypted: idEncoded,
          // Enhanced verification fields
          street_address: streetAddress,
          city: city,
          postal_code: postalCode,
          employment_status: employmentStatus,
          employer_name: employerName,
          monthly_income_range: monthlyIncomeRange,
          income_source: incomeSource,
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
          emergency_contact_relationship: emergencyContactRelationship,
          next_of_kin_name: nextOfKinName,
          next_of_kin_phone: nextOfKinPhone,
          next_of_kin_relationship: nextOfKinRelationship,
          bank_name: bankName,
          bank_account_number: bankAccountNumber,
          bank_account_name: bankAccountName,
          linkedin_url: linkedinUrl,
          facebook_url: facebookUrl,
          has_social_media: hasSocialMedia,
          referrer_phone: referrerPhone,
          updated_at: new Date().toISOString()
        })
        .eq('id', borrowerId)
    } else {
      // Create new borrower with all enhanced fields
      const { data: newBorrower, error: borrowerError } = await supabase
        .from('borrowers')
        .insert({
          country_code: profile.country_code,
          full_name: profile.full_name,
          national_id_hash: idHash,
          national_id_encrypted: idEncoded,
          phone_e164: phone,
          date_of_birth: dateOfBirth,
          email_verified: true,
          profile_completed: true,
          // Enhanced verification fields
          street_address: streetAddress,
          city: city,
          postal_code: postalCode,
          employment_status: employmentStatus,
          employer_name: employerName,
          monthly_income_range: monthlyIncomeRange,
          income_source: incomeSource,
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
          emergency_contact_relationship: emergencyContactRelationship,
          next_of_kin_name: nextOfKinName,
          next_of_kin_phone: nextOfKinPhone,
          next_of_kin_relationship: nextOfKinRelationship,
          bank_name: bankName,
          bank_account_number: bankAccountNumber,
          bank_account_name: bankAccountName,
          linkedin_url: linkedinUrl,
          facebook_url: facebookUrl,
          has_social_media: hasSocialMedia,
          referrer_phone: referrerPhone,
        })
        .select('id')
        .single()

      if (borrowerError || !newBorrower) {
        console.error('Borrower creation error:', borrowerError)
        return NextResponse.json(
          { error: 'Failed to create borrower record' },
          { status: 500 }
        )
      }

      borrowerId = newBorrower.id

      // Initialize borrower score
      await supabase
        .from('borrower_scores')
        .insert({
          borrower_id: borrowerId,
          score: 600,
          updated_at: new Date().toISOString()
        })

      // Add to identity index
      await supabase
        .from('borrower_identity_index')
        .insert({
          borrower_id: borrowerId,
          id_hash: idHash,
          phone_e164: phone,
          date_of_birth: dateOfBirth
        })
    }

    // Link borrower to user account
    console.log('Creating borrower_user_link:', { borrowerId, userId: user.id })

    const { data: linkData, error: linkError } = await supabase
      .from('borrower_user_links')
      .upsert({
        borrower_id: borrowerId,
        user_id: user.id,
        linked_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()

    console.log('Link created:', linkData)
    console.log('Link error:', linkError)

    if (linkError) {
      console.error('Link error details:', linkError)
      return NextResponse.json(
        { error: 'Failed to link borrower to user: ' + linkError.message },
        { status: 500 }
      )
    }

    // Verify the link was created
    const { data: verifyLink } = await supabase
      .from('borrower_user_links')
      .select('*')
      .eq('user_id', user.id)
      .single()

    console.log('Verification - link exists:', verifyLink)

    // Create duplicate detection record
    await supabase
      .from('duplicate_borrower_detection')
      .insert({
        borrower_id: borrowerId,
        user_id: user.id,
        national_id_hash: idHash,
        phone_e164: phone,
        name_normalized: profile.full_name.toLowerCase().replace(/\s+/g, ''),
        dob_key: dateOfBirth
      })

    // Create verification status record
    await supabase
      .from('borrower_self_verification_status')
      .insert({
        borrower_id: borrowerId,
        user_id: user.id
      })

    return NextResponse.json({
      success: true,
      borrowerId,
      linkCreated: !!verifyLink,
      message: 'Onboarding completed successfully'
    })
  } catch (error) {
    console.error('Complete onboarding error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
