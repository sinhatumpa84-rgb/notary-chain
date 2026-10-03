import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

const isHttps = process.env.HTTPS === 'true' || process.env.VITE_HTTPS === 'true';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isHttps ? [basicSsl()] : []),
  ],
  server: {
    port: 3000,
    https: isHttps,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
