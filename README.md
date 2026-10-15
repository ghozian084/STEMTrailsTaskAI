<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ddc30918-02a7-438f-81c4-732e06aeb252

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel

The Gemini API key is used only on the server (`api/gemini.ts`), never in the browser.

1. In Vercel, open the project → **Settings** → **Environment Variables**.
2. Add `GEMINI_API_KEY` with your Gemini API key (all environments).
3. Redeploy (**Deployments** → latest → **Redeploy**).

Do not use a `VITE_` prefix for the key: Vite would bundle it into the public JavaScript.
