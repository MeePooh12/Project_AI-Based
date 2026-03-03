import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://backend:5000',          // ชื่อ service ใน docker-compose.yml
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      },
      '/stock': {
        target: 'http://fastapi:8000',          // ← ชื่อ service ใน docker-compose.yml (จาก log คือ fastapi หรือ project-fastapi)
        changeOrigin: true,
        secure: false,
      },
      '/news': {
        target: 'http://fastapi:8000',
        changeOrigin: true,
        secure: false,
      },
      '/recommend': {
        target: 'http://fastapi:8000',
        changeOrigin: true,
        secure: false,
      },
      '/risk': {
        target: 'http://fastapi:8000',
        changeOrigin: true
      },
      '/rss': {
        target: 'http://fastapi:8000',
        changeOrigin: true,
        secure: false,
      }
    },
    strictPort: true
  }
})