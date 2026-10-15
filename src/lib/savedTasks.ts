import type { GeneratedTask } from '../services/geminiService';

// Tasks are kept in this browser's localStorage (no account needed).

export interface SavedTask {
  id: string;
  savedAt: number;
  thumbnail: string;
  image: string;
  objectName: string;
  geometricShape: string;
  answerFormat: string;
  grade: string;
  tools: string[];
  tags: string[];
  taskDescription?: string;
  measurements?: Record<string, string>;
  task: GeneratedTask;
}

const KEY = 'mathtrails.savedTasks.v1';

export const loadSavedTasks = (): SavedTask[] => {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const write = (tasks: SavedTask[]) => {
  localStorage.setItem(KEY, JSON.stringify(tasks));
};

// Saves a task at the front of the list. If storage is full, drops the
// full-size image of the oldest tasks (keeping their thumbnails), then the
// oldest tasks themselves, until it fits. Returns the stored list.
export const saveTask = (task: SavedTask): SavedTask[] => {
  let tasks = [task, ...loadSavedTasks().filter((t) => t.id !== task.id)];
  for (;;) {
    try {
      write(tasks);
      return tasks;
    } catch {
      const idx = tasks.map((t) => t.image !== t.thumbnail).lastIndexOf(true);
      if (idx > 0) {
        tasks = tasks.map((t, i) => (i === idx ? { ...t, image: t.thumbnail } : t));
      } else if (tasks.length > 1) {
        tasks = tasks.slice(0, -1);
      } else {
        throw new Error('Browser storage is full.');
      }
    }
  }
};

export const deleteTask = (id: string): SavedTask[] => {
  const tasks = loadSavedTasks().filter((t) => t.id !== id);
  try {
    write(tasks);
  } catch {
    // ignore; removal only shrinks storage
  }
  return tasks;
};

export const makeThumbnail = (dataUrl: string, maxWidth = 320): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
