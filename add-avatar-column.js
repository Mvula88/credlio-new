// Script to add avatar_url column to profiles table in production
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://lboiicdewlivkfaqweuv.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib2lpY2Rld2xpdmtmYXF3ZXV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTcwNTg1OSwiZXhwIjoyMDcxMjgxODU5fQ.ymIl78hMKaEOZtd9WW-65LU7z4WaRJDZh4aKupt5kfE'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function addAvatarColumn() {
  console.log('Adding avatar_url column to profiles table...')

  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'avatar_url'
        ) THEN
          ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
        END IF;
      END $$;
    `
  })

  if (error) {
    console.error('Error adding column:', error)
    console.log('\nPlease run this SQL manually in Supabase Dashboard -> SQL Editor:')
    console.log('\nALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;')
    return
  }

  console.log('✓ Column added successfully!')
}

addAvatarColumn()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
