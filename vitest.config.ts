import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://example.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-anon-key'),
    'import.meta.env.VITE_SPACE_ID': JSON.stringify('test-space'),
    'import.meta.env.VITE_FUNCTIONS_URL': JSON.stringify('https://example.supabase.co/functions/v1'),
  },
  test: {
    environment: 'node',
  },
})
