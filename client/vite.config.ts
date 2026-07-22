import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Was `path.resolve(__dirname, './src')` imported from 'path/win32',
      // which produces backslash paths on Linux/macOS and breaks the alias.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
