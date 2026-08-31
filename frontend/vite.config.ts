import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/u': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  define: {
    "__APP_VERSION__": JSON.stringify(process.env.npm_package_version)
  },
})
