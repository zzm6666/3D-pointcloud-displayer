import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue(), cesium()],
    server: {
      port: 5173,
      host: 'localhost',
      proxy: {
        '/file': {
          target: env.VITE_SERVER_URL,
          changeOrigin: true
        }
      }
    }
  }
})
