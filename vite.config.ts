import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

// Serves api/gemini.ts during `npm run dev`, mirroring the Vercel Function in production.
const geminiApiDev = (): Plugin => ({
  name: 'gemini-api-dev',
  configureServer(server) {
    server.middlewares.use('/api/gemini', async (req, res) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const {POST} = await server.ssrLoadModule('/api/gemini.ts');
        const response: Response = await POST(
          new Request('http://localhost/api/gemini', {
            method: req.method,
            headers: {'content-type': 'application/json'},
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          }),
        );
        res.statusCode = response.status;
        res.setHeader('content-type', 'application/json');
        res.end(await response.text());
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({error: {code: 500, message: String(err?.message || err)}}));
      }
    });
  },
});

export default defineConfig(({mode}) => {
  // Load GEMINI_API_KEY from .env files into process.env for the dev API (server-side only).
  const env = loadEnv(mode, '.', '');
  if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  return {
    plugins: [react(), tailwindcss(), geminiApiDev()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
