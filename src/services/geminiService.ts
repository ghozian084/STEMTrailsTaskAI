import { GoogleGenAI, Type } from "@google/genai";

// Primary model first; later entries are fallbacks used when the primary is
// overloaded, rate-limited or unavailable.
const MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"];
const MAX_RETRIES_PER_MODEL = 2;

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("API key is missing. Please add GEMINI_API_KEY to your environment variables and rebuild the app.");
  }
  return new GoogleGenAI({ apiKey });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getStatus = (err: any): number | undefined => {
  if (typeof err?.status === "number") return err.status;
  const match = String(err?.message || "").match(/"code"\s*:\s*(\d{3})|\b(429|500|502|503|504)\b/);
  return match ? Number(match[1] || match[2]) : undefined;
};

// Errors worth retrying or falling back on: overload, rate limit, server errors,
// network failures, model-not-found, and malformed/empty model output.
const isRetryable = (err: any) => {
  if (err?.name === "InvalidResponseError") return true;
  const status = getStatus(err);
  if (status === 404 || status === 408 || status === 429 || (status !== undefined && status >= 500)) return true;
  return /fetch|network|overloaded|unavailable|timeout/i.test(String(err?.message || ""));
};

// Turns raw SDK errors (often a JSON blob) into a short, readable message.
const toFriendlyError = (err: any): Error => {
  const raw = String(err?.message || err || "");
  let message = raw;
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf("{")));
    message = parsed?.error?.message || message;
  } catch {
    // not JSON, keep raw message
  }
  const status = getStatus(err);
  if (status === 400 && /api key/i.test(message)) {
    return new Error("The Gemini API key is invalid. Please check GEMINI_API_KEY.");
  }
  if (status === 403) {
    return new Error("Access denied by the Gemini API. Check that your API key is valid and has access to this model.");
  }
  if (status === 429) {
    return new Error("Gemini API quota or rate limit reached. Please wait a minute and try again.");
  }
  if (status !== undefined && status >= 500) {
    return new Error("The Gemini AI service is busy right now. Please try again in a moment.");
  }
  return new Error(message || "Unknown error from the AI service.");
};

class InvalidResponseError extends Error {
  name = "InvalidResponseError";
}

const parseJson = (text: string | undefined) => {
  if (!text) throw new InvalidResponseError("The AI returned an empty response.");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new InvalidResponseError("The AI returned an invalid response. Please try again.");
  }
};

// Runs a structured-output request with retries and model fallback, then
// validates the parsed JSON with `normalize` (which throws InvalidResponseError
// when required data is missing, so the request is retried).
const generateJson = async <T>(
  contents: any[],
  responseSchema: any,
  normalize: (data: any) => T
): Promise<T> => {
  const ai = getAI();
  let lastError: any;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: { responseMimeType: "application/json", responseSchema },
        });
        return normalize(parseJson(response.text));
      } catch (err: any) {
        lastError = err;
        if (!isRetryable(err)) throw toFriendlyError(err);
        // Model not found: skip straight to the next model.
        if (getStatus(err) === 404) break;
        await sleep(1000 * 2 ** attempt);
      }
    }
  }
  throw toFriendlyError(lastError);
};

const imagePart = (base64Image: string) => {
  const match = base64Image.match(/^data:([^;]+);base64,(.*)$/);
  return {
    inlineData: {
      mimeType: match?.[1] || "image/jpeg",
      data: match?.[2] || base64Image,
    },
  };
};

const asString = (v: any): string => (v === undefined || v === null ? "" : String(v));
const asStringArray = (v: any): string[] =>
  Array.isArray(v) ? v.map(asString).filter(Boolean) : v ? [asString(v)] : [];

export interface Suggestion {
  objectName: string;
  geometricShape: string;
  tasks: string[];
  grade: string;
  tools: string[];
  tags: string[];
}

export interface GeneratedTask {
  title: string;
  definition: string;
  solution: string;
  hints: string[];
  aboutObject: string;
  answerValue: string;
  mcOptions?: { A: string; B: string; C: string; D: string; correct: string };
  fillBlanks?: { statement: string; checkType: string };
  intervalValues?: { a: string; b: string; x: string; c: string; d: string };
  subtasks?: GeneratedTask[];
}

const normalizeSuggestion = (data: any): Suggestion => {
  const tasks = asStringArray(data?.tasks);
  if (!asString(data?.objectName) || tasks.length === 0) {
    throw new InvalidResponseError("The AI could not identify an object in this image. Try a clearer photo.");
  }
  return {
    objectName: asString(data.objectName),
    geometricShape: asString(data.geometricShape),
    tasks,
    grade: asString(data.grade),
    tools: asStringArray(data.tools),
    tags: asStringArray(data.tags),
  };
};

export const analyzeImage = async (base64Image: string): Promise<Suggestion> => {
  return generateJson(
    [
      imagePart(base64Image),
      {
        text: `Analyze this image for a STEM Math Trail task. 
        Identify the main object, its geometric shape, and suggest 3 mathematical tasks related to it.
        
        MATH TRAIL PRINCIPLES:
        1. Presence (Site-Specific): The task must be deeply rooted in its physical location. It should only be solvable by being at the object, not by reading a description elsewhere.
        2. Activity: Tasks should encourage physical activity and "embodied mathematics," requiring solvers to do something, such as measure, count, estimate, or interact with the site.
        3. Reality: Problems should be realistic and relate to authentic, tangible objects found in the environment (e.g., parks, cities).
        4. Clarity: The task suggested must be clear and unambiguous.

        The tasks should integrate STEM Education (Science, Technology, Engineering, and Mathematics), with a strong focus on Mathematics Education (e.g., geometry, trigonometry, algebra, statistics).
        For "grade", choose exactly one of: "Grade 1-2", "Grade 3-4", "Grade 5-6", "Grade 7-8", "High School", "University".
        Return the result in JSON format.`,
      },
    ],
    {
      type: Type.OBJECT,
      properties: {
        objectName: { type: Type.STRING },
        geometricShape: { type: Type.STRING },
        tasks: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: "3", maxItems: "3" },
        grade: { type: Type.STRING },
        tools: { type: Type.ARRAY, items: { type: Type.STRING } },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["objectName", "geometricShape", "tasks", "grade", "tools", "tags"],
    },
    normalizeSuggestion
  );
};

export const generateTask = async (
  base64Image: string,
  objectName: string,
  geometricShape: string,
  taskDescription: string,
  measurements: Record<string, string>,
  answerFormat: string,
  numSubtasks: number
): Promise<GeneratedTask> => {
  const prompt = `
    Based on the image and the following details, generate a complete STEM Math Trail task.
    Object: ${objectName}
    Shape: ${geometricShape}
    Task: ${taskDescription}
    Measurements: ${JSON.stringify(measurements)}
    Answer Format: ${answerFormat}
    Number of Subtasks: ${numSubtasks}

    STEM INTEGRATION:
    The task must be a high-quality STEM Education resource, specifically focused on Mathematics Education. 
    Integrate real-world applications of math found in the object (e.g., engineering principles, scientific measurements, or technological design).
    Ensure the mathematical reasoning is rigorous yet appropriate for the target grade level.

    MATH TRAIL PRINCIPLES:
    1. Presence (Site-Specific): The task must be deeply rooted in its physical location. It should only be solvable by being at the object, not by reading a description elsewhere.
    2. Activity: Tasks should encourage physical activity and "embodied mathematics," requiring solvers to do something, such as measure, count, estimate, and making some thing that related to the site.
    3. Reality: Problems should be realistic and relate to authentic, tangible objects found in the environment (e.g., parks, cities).
    4. Clarity: The task definition must be clear, unambiguous, and explain exactly what the solver needs to do.

    Provide:
    1. A catchy title (max 25 chars).
    2. A clear definition of the task/objective. IMPORTANT: Do NOT mention any specific measurements (sizes/values) that the students are expected to measure themselves in the field.
    3. A detailed solution. Use LaTeX for all mathematical expressions and steps. Wrap inline math in $...$ and block math in $$...$$. The solution should be a complete walkthrough.
    4. 3 stepped hints. IMPORTANT: Do NOT mention any specific measurements in the hints. Hints should guide the student on HOW to measure or WHAT formula to use. Wrap any math in hints with $...$.
    5. A short description "About the Object".
    6. The correct answer values based on the selected format (${answerFormat}).
    
    CRITICAL - ANSWER FORMAT REQUIREMENTS:
    - If format is "Interval", you MUST provide "intervalValues" object with keys: a (outer lower), b (inner lower), x (accurate), c (inner upper), d (outer upper). All must be strings (e.g., "10.5").
    - If format is "Multiple Choice", you MUST provide "mcOptions" object with keys: A, B, C, D (strings) and "correct" (one of "A", "B", "C", "D").
    - If format is "Fill the Blanks", you MUST provide "fillBlanks" object with keys: "statement" (string with blanks) and "checkType" (e.g., "string" or "number").
    - If format is "Exact Value", you MUST provide "answerValue" (the numeric or short string result).
    - ALWAYS provide a summary of the correct answer in "answerValue" even if another format is used.
    
    ${numSubtasks > 0
      ? `SUBTASKS: You MUST provide exactly ${numSubtasks} item(s) in the "subtasks" array. Each subtask builds toward the main task and has its own title, definition, solution, 3 hints, "answerValue", and the answer object required by the "${answerFormat}" format.`
      : `Do NOT include a "subtasks" array.`}

    Make sure the solution is mathematically correct and the answer values match the final result of the solution.
  `;

  const normalizeTask = (data: any, isSubtask = false): GeneratedTask => {
    if (!data || typeof data !== "object" || !asString(data.title) || !asString(data.solution)) {
      throw new InvalidResponseError("The AI returned an incomplete task. Please try again.");
    }
    const task: GeneratedTask = {
      title: asString(data.title),
      definition: asString(data.definition),
      solution: asString(data.solution),
      hints: asStringArray(data.hints),
      aboutObject: asString(data.aboutObject),
      answerValue: asString(data.answerValue),
    };
    if (data.mcOptions) {
      const { A, B, C, D, correct } = data.mcOptions;
      task.mcOptions = {
        A: asString(A), B: asString(B), C: asString(C), D: asString(D),
        correct: asString(correct).trim().toUpperCase().charAt(0),
      };
    }
    if (data.fillBlanks) {
      task.fillBlanks = {
        statement: asString(data.fillBlanks.statement),
        checkType: asString(data.fillBlanks.checkType),
      };
    }
    if (data.intervalValues) {
      const iv = data.intervalValues;
      const pick = (k: string) => asString(iv[k] ?? iv[k.toUpperCase()]);
      task.intervalValues = { a: pick("a"), b: pick("b"), x: pick("x"), c: pick("c"), d: pick("d") };
    }
    const missing =
      (answerFormat === "Multiple Choice" && !task.mcOptions) ||
      (answerFormat === "Fill the Blanks" && !task.fillBlanks) ||
      (answerFormat === "Interval" && !task.intervalValues);
    if (missing) {
      throw new InvalidResponseError(`The AI did not provide the ${answerFormat} answer. Please try again.`);
    }
    if (!isSubtask && numSubtasks > 0) {
      const subtasks = Array.isArray(data.subtasks) ? data.subtasks : [];
      if (subtasks.length === 0) {
        throw new InvalidResponseError("The AI did not generate the requested subtasks. Please try again.");
      }
      task.subtasks = subtasks.slice(0, numSubtasks).map((st: any) => normalizeTask(st, true));
    }
    return task;
  };

  return generateJson(
    [imagePart(base64Image), { text: prompt }],
    {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        definition: { type: Type.STRING },
        solution: { type: Type.STRING },
        hints: { type: Type.ARRAY, items: { type: Type.STRING } },
        aboutObject: { type: Type.STRING },
        answerValue: { type: Type.STRING, description: "A summary of the correct answer. ALWAYS REQUIRED for all formats." },
        mcOptions: {
          type: Type.OBJECT,
          properties: {
            A: { type: Type.STRING },
            B: { type: Type.STRING },
            C: { type: Type.STRING },
            D: { type: Type.STRING },
            correct: { type: Type.STRING },
          },
          required: ["A", "B", "C", "D", "correct"],
          description: "Provide this object if the format is Multiple Choice"
        },
        fillBlanks: {
          type: Type.OBJECT,
          properties: {
            statement: { type: Type.STRING },
            checkType: { type: Type.STRING },
          },
          required: ["statement", "checkType"],
          description: "Provide this object if the format is Fill the Blanks"
        },
        intervalValues: {
          type: Type.OBJECT,
          properties: {
            a: { type: Type.STRING },
            b: { type: Type.STRING },
            x: { type: Type.STRING },
            c: { type: Type.STRING },
            d: { type: Type.STRING },
          },
          required: ["a", "b", "x", "c", "d"],
          description: "Provide this object if the format is Interval"
        },
        subtasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              definition: { type: Type.STRING },
              solution: { type: Type.STRING },
              hints: { type: Type.ARRAY, items: { type: Type.STRING } },
              mcOptions: {
                type: Type.OBJECT,
                properties: {
                  A: { type: Type.STRING },
                  B: { type: Type.STRING },
                  C: { type: Type.STRING },
                  D: { type: Type.STRING },
                  correct: { type: Type.STRING },
                },
                required: ["A", "B", "C", "D", "correct"],
                description: "Provide this object if the format is Multiple Choice"
              },
              intervalValues: {
                type: Type.OBJECT,
                properties: {
                  a: { type: Type.STRING },
                  b: { type: Type.STRING },
                  x: { type: Type.STRING },
                  c: { type: Type.STRING },
                  d: { type: Type.STRING },
                },
                required: ["a", "b", "x", "c", "d"],
                description: "Provide this object if the format is Interval"
              },
              fillBlanks: {
                type: Type.OBJECT,
                properties: {
                  statement: { type: Type.STRING },
                  checkType: { type: Type.STRING },
                },
                required: ["statement", "checkType"],
                description: "Provide this object if the format is Fill the Blanks"
              },
              answerValue: { type: Type.STRING, description: "A summary of the correct answer. ALWAYS REQUIRED for all formats." },
            },
            required: ["title", "definition", "solution", "hints", "answerValue"],
          },
        },
      },
      required: ["title", "definition", "solution", "hints", "aboutObject", "answerValue"],
    },
    (data) => normalizeTask(data)
  );
};
