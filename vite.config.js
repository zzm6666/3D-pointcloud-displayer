import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

const SERVER_URL = process.env.VITE_SERVER_URL

export default defineConfig({
  plugins: [vue(), cesium()],
  server: {
    allowedHosts: 'all',
    port: 5173,
    host: '0.0.0.0',
    cors: true,
    proxy: {
      '/file': {
        target: SERVER_URL,
        changeOrigin: true
      },
    },
  },
})
