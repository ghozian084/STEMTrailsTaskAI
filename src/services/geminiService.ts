import { GoogleGenAI, Type } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("API key is missing. Please add GEMINI_API_KEY to your environment variables and rebuild the app.");
  }
  return new GoogleGenAI({ apiKey });
};

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
  answerValue: any;
  mcOptions?: { A: string; B: string; C: string; D: string; correct: string };
  fillBlanks?: { statement: string; checkType: string };
  intervalValues?: { a: number; b: number; x: number; c: number; d: number };
  subtasks?: GeneratedTask[];
}

export const analyzeImage = async (base64Image: string): Promise<Suggestion> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image.split(",")[1],
        },
      },
      {
        text: `Analyze this image for a STEM Math Trail task. 
        Identify the main object, its geometric shape, and suggest 3 mathematical tasks related to it.
        
        MATH TRAIL PRINCIPLES:
        1. Presence (Site-Specific): The task must be deeply rooted in its physical location. It should only be solvable by being at the object, not by reading a description elsewhere.
        2. Activity: Tasks should encourage physical activity and "embodied mathematics," requiring solvers to do something, such as measure, count, estimate, or interact with the site.
        3. Reality: Problems should be realistic and relate to authentic, tangible objects found in the environment (e.g., parks, cities).
        4. Clarity: The task suggested must be clear and unambiguous.

        The tasks should integrate STEM Education (Science, Technology, Engineering, and Mathematics), with a strong focus on Mathematics Education (e.g., geometry, trigonometry, algebra, statistics).
        Return the result in JSON format.`,
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          objectName: { type: Type.STRING },
          geometricShape: { type: Type.STRING },
          tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
          grade: { type: Type.STRING },
          tools: { type: Type.ARRAY, items: { type: Type.STRING } },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["objectName", "geometricShape", "tasks", "grade", "tools", "tags"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
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
  const ai = getAI();
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
    
    If numSubtasks > 0, also provide an array of "subtasks" each with its own title, definition, solution, hints, and the appropriate answer values based on the format.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image.split(",")[1],
        },
      },
      { text: prompt },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
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
    },
  });

  return JSON.parse(response.text || "{}");
};
