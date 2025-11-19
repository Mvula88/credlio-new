// Script to create the avatars storage bucket in production
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://lboiicdewlivkfaqweuv.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib2lpY2Rld2xpdmtmYXF3ZXV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTcwNTg1OSwiZXhwIjoyMDcxMjgxODU5fQ.ymIl78hMKaEOZtd9WW-65LU7z4WaRJDZh4aKupt5kfE'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createAvatarsBucket() {
  console.log('Creating avatars bucket...')

  const { data, error } = await supabase.storage.createBucket('avatars', {
    public: true,
    fileSizeLimit: 2097152, // 2MB
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
  })

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('✓ Bucket already exists!')
      return
    }
    console.error('Error creating bucket:', error)
    return
  }

  console.log('✓ Bucket created successfully!', data)
}

createAvatarsBucket()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
