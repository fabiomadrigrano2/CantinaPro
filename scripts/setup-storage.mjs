import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

function loadEnv() {
  try {
    const content = readFileSync('.env.local', 'utf-8')
    const env = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
    return env
  } catch {
    return {}
  }
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários no .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

console.log('🚀 Criando bucket "produtos" no Supabase Storage...')

const { error } = await supabase.storage.createBucket('produtos', {
  public: true,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  fileSizeLimit: 5 * 1024 * 1024,
})

if (error && !error.message.toLowerCase().includes('already exists')) {
  console.error('❌ Erro ao criar bucket:', error.message)
  process.exit(1)
}

console.log('✅ Bucket "produtos" pronto!')
console.log('')
console.log('📋 Execute este SQL no Supabase SQL Editor (Dashboard → SQL Editor):')
console.log('─────────────────────────────────────────────────────────────────')
console.log(`
-- Permite que usuários autenticados façam upload de fotos
CREATE POLICY "Upload de fotos de produtos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'produtos');

-- Permite que usuários autenticados atualizem fotos
CREATE POLICY "Atualizar fotos de produtos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'produtos');

-- Leitura pública das fotos
CREATE POLICY "Leitura pública de fotos de produtos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'produtos');
`)
console.log('─────────────────────────────────────────────────────────────────')
console.log('')
console.log('✅ Configuração completa! Agora as fotos de produtos estão habilitadas.')
