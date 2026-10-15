import { GoogleGenAI } from "@google/genai";

// Server-side proxy for Gemini so the API key never reaches the browser.
// Runs as a Vercel Function in production and via a Vite middleware in dev.

const ALLOWED_MODELS = new Set(["gemini-3-flash-preview", "gemini-2.5-flash"]);
const MAX_BODY_CHARS = 4_000_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return json({ error: { code: 500, message: "API key is missing. Add GEMINI_API_KEY to the server environment variables and redeploy." } }, 500);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return json({ error: { code: 413, message: "Image is too large. Please use a smaller photo." } }, 413);
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: { code: 400, message: "Invalid request body." } }, 400);
  }
  const { model, contents, config } = body || {};
  if (!ALLOWED_MODELS.has(model) || !Array.isArray(contents)) {
    return json({ error: { code: 400, message: "Invalid request." } }, 400);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: config?.responseSchema,
      },
    });
    return json({ text: response.text ?? "" });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    let message = String(err?.message || "Unknown error from the AI service.");
    try {
      message = JSON.parse(message.slice(message.indexOf("{")))?.error?.message || message;
    } catch {
      // not JSON, keep raw message
    }
    return json({ error: { code: status, message } }, status);
  }
}
