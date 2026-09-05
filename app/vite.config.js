import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Le contrat de scoring et le moteur réglementaire vivent à la racine
      // du repo (/scoring, /regulatory), partagés avec la maquette HTML et
      // testés indépendamment (node --test) — une seule source de vérité.
      '@scoring': path.resolve(__dirname, '../scoring'),
      '@regulatory': path.resolve(__dirname, '../regulatory'),
      '@finance': path.resolve(__dirname, '../finance'),
      '@rag': path.resolve(__dirname, '../rag'),
      '@veille': path.resolve(__dirname, '../veille'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
})
