import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Copy, 
  Edit, 
  Plus, 
  Minus, 
  Info, 
  Lightbulb, 
  Calculator, 
  Tag, 
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { analyzeImage, generateTask, Suggestion, GeneratedTask, SHAPES } from './services/geminiService';
import { SavedTask, loadSavedTasks, saveTask, deleteTask, makeThumbnail, newId } from './lib/savedTasks';
import TasksPage from './components/TasksPage';
import HelpPage from './components/HelpPage';

// Image compression utility
const compressImage = async (base64Str: string, maxWidth = 1024, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    // Formats the browser can't decode (e.g. HEIC) would otherwise hang forever.
    img.onerror = () => resolve(base64Str);
  });
};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LatexRenderer = ({ text }: { text: string }) => {
  if (!text) return null;
  
  // Split text by $...$ and $$...$$
  // Using a regex that captures the delimiters
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
  
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return (
            <div key={i} className="my-4 overflow-x-auto">
              <BlockMath math={part.slice(2, -2)} />
            </div>
          );
        } else if (part.startsWith('$') && part.endsWith('$')) {
          return <InlineMath key={i} math={part.slice(1, -1)} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

type Step = 'upload' | 'suggestions' | 'measurements' | 'output';
type Page = 'dashboard' | 'tasks' | 'help';

const SUB_SHAPES = [
  'Rectangle', 'Square', 'Circle', 'Triangle', 'Right Triangle', 'Cylinder', 'Sphere', 'Cube', 'Cuboid', 'Pyramid', 'Cone'
];

interface TaskState {
  image: string | null;
  objectName: string;
  geometricShape: string;
  selectedSubShapes: string[];
  selectedTask: string;
  customTask: string;
  numSubtasks: number;
  answerFormat: 'Interval' | 'Exact Value' | 'Multiple Choice' | 'Fill the Blanks';
  measurements: Record<string, string>;
  suggestions: Suggestion | null;
  generatedTask: GeneratedTask | null;
  grade: string;
  tools: string[];
  tags: string[];
}

const INITIAL_STATE: TaskState = {
  image: null,
  objectName: '',
  geometricShape: '',
  selectedSubShapes: [],
  selectedTask: '',
  customTask: '',
  numSubtasks: 0,
  answerFormat: 'Exact Value',
  measurements: {},
  suggestions: null,
  generatedTask: null,
  grade: '',
  tools: [],
  tags: []
};

const GRADES = [
  'Grade 1-2', 'Grade 3-4', 'Grade 5-6', 'Grade 7-8', 'High School', 'University'
];

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [step, setStep] = useState<Step>('upload');
  const [savedTasks, setSavedTasks] = useState<SavedTask[]>(() => loadSavedTasks());
  const [savedId, setSavedId] = useState<string | null>(null);
  const [state, setState] = useState<TaskState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; details?: string; retry?: () => void } | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = (file: File | undefined) => {
    if (!file || loading) return;
    if (!file.type.startsWith('image/')) {
      setError({ message: 'Unsupported file.', details: 'Please choose an image file (JPG, PNG or WebP).' });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result as string);
      setState({ ...INITIAL_STATE, image: compressed });
      analyze(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    loadFile(e.target.files?.[0]);
    // Reset so choosing the same photo again still triggers onChange.
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  const startOver = () => {
    setState(INITIAL_STATE);
    setError(null);
    setSavedId(null);
    setStep('upload');
    setPage('dashboard');
  };

  const goTo = (target: Page) => {
    setPage(target);
    window.scrollTo({ top: 0 });
  };

  const openSavedTask = (t: SavedTask) => {
    setState({
      ...INITIAL_STATE,
      image: t.image,
      objectName: t.objectName,
      geometricShape: t.geometricShape,
      answerFormat: t.answerFormat as TaskState['answerFormat'],
      selectedTask: t.taskDescription ? 'custom' : '',
      customTask: t.taskDescription || '',
      measurements: t.measurements || {},
      numSubtasks: t.task.subtasks?.length || 0,
      grade: t.grade,
      tools: t.tools,
      tags: t.tags,
      generatedTask: t.task,
    });
    setSavedId(t.id);
    setStep('output');
    goTo('dashboard');
  };

  const persistTask = async (task: GeneratedTask) => {
    if (!state.image) return;
    const record: SavedTask = {
      id: newId(),
      savedAt: Date.now(),
      thumbnail: await makeThumbnail(state.image),
      image: state.image,
      objectName: state.objectName,
      geometricShape: state.geometricShape,
      answerFormat: state.answerFormat,
      grade: state.grade,
      tools: state.tools,
      tags: state.tags,
      taskDescription: state.selectedTask === 'custom' ? state.customTask : state.selectedTask,
      measurements: state.measurements,
      task,
    };
    try {
      setSavedTasks(saveTask(record));
      setSavedId(record.id);
    } catch {
      setSavedId(null);
      setError({ message: 'Task not saved.', details: 'Browser storage is full. Delete some tasks on the Tasks page.' });
    }
  };

  const analyze = async (image: string) => {
    setLoading(true);
    setLoadingMessage('Scanning image for geometry...');
    setError(null);
    try {
      const suggestions = await analyzeImage(image);
      setState(prev => ({
        ...prev,
        suggestions,
        objectName: suggestions.objectName,
        geometricShape: suggestions.geometricShape,
        selectedTask: suggestions.tasks[0],
        grade: suggestions.grade,
        tools: suggestions.tools,
        tags: suggestions.tags
      }));
      setStep('suggestions');
    } catch (err: any) {
      setError({ 
        message: 'Image analysis failed.', 
        details: err.message || 'The AI could not identify the object clearly. Try a clearer photo or check your connection.',
        retry: () => analyze(image)
      });
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  };

  const handleGenerate = async () => {
    if (!state.image) return;
    setLoading(true);
    setLoadingMessage('Calculating solution and generating task...');
    setError(null);
    
    // Timer to update messages if it takes too long
    const timer = setTimeout(() => {
      setLoadingMessage('Still working... Complex math and subtasks take extra time to process.');
    }, 8000);

    const fields = getCurrentMeasurementFields();
    const measurements: Record<string, string> = Object.fromEntries(
      (Object.entries(state.measurements) as [string, string][]).filter(([k, v]) => fields.includes(k) && v !== '')
    );

    try {
      const task = await generateTask(
        state.image,
        state.objectName,
        state.geometricShape,
        state.selectedTask === 'custom' ? state.customTask : state.selectedTask,
        measurements,
        state.answerFormat,
        state.numSubtasks
      );
      setState(prev => ({ ...prev, generatedTask: task }));
      setStep('output');
      persistTask(task);
    } catch (err: any) {
      setError({ 
        message: 'Task generation failed.', 
        details: err.message || 'This often happens with complex combined shapes or many subtasks. Try reducing subtasks or simplifying measurements.',
        retry: handleGenerate
      });
    } finally {
      clearTimeout(timer);
      setLoading(false);
      setLoadingMessage(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError({ message: 'Copy failed.', details: 'Your browser blocked clipboard access. Select the text and copy it manually.' });
    }
  };

  const getMeasurementFields = (shape: string) => {
    switch(shape) {
      case 'Circle': return ['Radius (cm)'];
      case 'Rectangle':
      case 'Square': return ['Length (cm)', 'Width (cm)'];
      case 'Cylinder': return ['Radius (cm)', 'Height (cm)'];
      case 'Sphere': return ['Radius (cm)'];
      case 'Triangle': return ['Base (cm)', 'Height (cm)'];
      case 'Right Triangle': return ['Base (cm)', 'Height (cm)', 'Angle (deg)'];
      case 'Cube': return ['Side (cm)'];
      case 'Cuboid': return ['Length (cm)', 'Width (cm)', 'Height (cm)'];
      case 'Pyramid': return ['Base Length (cm)', 'Base Width (cm)', 'Height (cm)'];
      case 'Cone': return ['Radius (cm)', 'Height (cm)'];
      default: return ['Length (cm)', 'Width (cm)', 'Height (cm)'];
    }
  };

  const getCurrentMeasurementFields = () => {
    if (state.geometricShape !== 'Combination of Shapes') return getMeasurementFields(state.geometricShape);
    const fields: string[] = [];
    state.selectedSubShapes.forEach(s => {
      getMeasurementFields(s).forEach(f => {
        const uniqueField = `${s}: ${f}`;
        if (!fields.includes(uniqueField)) fields.push(uniqueField);
      });
    });
    return fields;
  };

  const renderStep = () => {
    switch (step) {
      case 'upload':
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">Professional STEM Task Maker</h1>
              <p className="text-slate-500 max-w-lg mx-auto">
                Create engaging and educational STEM tasks from real-world images.
              </p>
            </div>

            <div 
              className={cn("w-full max-w-2xl p-12 border-2 border-dashed rounded-3xl bg-white shadow-sm hover:border-indigo-400 transition-colors cursor-pointer group flex flex-col items-center space-y-6", dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-200")}
              onClick={() => !loading && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="w-10 h-10 text-indigo-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-slate-900">Upload from File / Camera</p>
                <p className="text-slate-400 mt-1">Drag and drop or click to select a photo</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageUpload}
              />
              
              {loading && (
                <div className="flex flex-col items-center space-y-3 text-indigo-600 font-medium">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{loadingMessage || 'Analyzing image...'}</span>
                  </div>
                  <p className="text-xs text-slate-400 max-w-xs text-center">
                    This usually takes 5-10 seconds. We're compressing your photo to speed things up!
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'suggestions':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-3xl shadow-md overflow-hidden border border-slate-100">
                <img src={state.image!} alt="Uploaded" className="w-full h-auto rounded-2xl" />
              </div>
              <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
                <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  AI Identification
                </h3>
                <p className="text-indigo-700 mt-2 text-sm leading-relaxed">
                  We've identified the object and its geometric properties. You can refine these below.
                </p>
              </div>
            </div>

            <div className="space-y-8 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">Object Name</label>
                <input 
                  type="text" 
                  value={state.objectName}
                  onChange={(e) => setState(prev => ({ ...prev, objectName: e.target.value }))}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="e.g., Park Bench"
                />
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">Geometric Shape</label>
                <select 
                  value={state.geometricShape}
                  onChange={(e) => setState(prev => ({ ...prev, geometricShape: e.target.value }))}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none"
                >
                  {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                
                {state.geometricShape === 'Combination of Shapes' && (
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                    <p className="text-sm font-semibold text-slate-700">Select Combined Shapes:</p>
                    <div className="grid grid-cols-2 gap-3">
                      {SUB_SHAPES.map(s => (
                        <label key={s} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 cursor-pointer hover:border-indigo-300 transition-colors">
                          <input 
                            type="checkbox"
                            checked={state.selectedSubShapes.includes(s)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setState(prev => ({
                                ...prev,
                                selectedSubShapes: checked 
                                  ? [...prev.selectedSubShapes, s]
                                  : prev.selectedSubShapes.filter(x => x !== s)
                              }));
                            }}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                          />
                          <span className="text-sm text-slate-600">{s}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">STEM Task Suggestions</label>
                <div className="space-y-3">
                  {state.suggestions?.tasks.map((t, i) => (
                    <label key={i} className={cn(
                      "flex items-center p-4 rounded-2xl border cursor-pointer transition-all",
                      state.selectedTask === t ? "bg-indigo-50 border-indigo-200 ring-2 ring-indigo-500" : "bg-slate-50 border-slate-200 hover:border-indigo-300"
                    )}>
                      <input 
                        type="radio" 
                        name="task" 
                        checked={state.selectedTask === t}
                        onChange={() => setState(prev => ({ ...prev, selectedTask: t }))}
                        className="hidden"
                      />
                      <span className={cn("text-sm font-medium", state.selectedTask === t ? "text-indigo-900" : "text-slate-600")}>{t}</span>
                    </label>
                  ))}
                  <div className={cn(
                    "p-4 rounded-2xl border transition-all",
                    state.selectedTask === 'custom' ? "bg-indigo-50 border-indigo-200 ring-2 ring-indigo-500" : "bg-slate-50 border-slate-200"
                  )}>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="task" 
                        checked={state.selectedTask === 'custom'}
                        onChange={() => setState(prev => ({ ...prev, selectedTask: 'custom' }))}
                        className="hidden"
                      />
                      <span className="text-sm font-medium text-slate-600">Or, write your own:</span>
                    </label>
                    {state.selectedTask === 'custom' && (
                      <textarea 
                        value={state.customTask}
                        onChange={(e) => setState(prev => ({ ...prev, customTask: e.target.value }))}
                        className="w-full mt-3 p-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        placeholder="Describe your task..."
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">Subtasks</label>
                  <select 
                    value={state.numSubtasks}
                    onChange={(e) => setState(prev => ({ ...prev, numSubtasks: parseInt(e.target.value) }))}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">Format</label>
                  <select 
                    value={state.answerFormat}
                    onChange={(e) => setState(prev => ({ ...prev, answerFormat: e.target.value as any }))}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    {['Interval', 'Exact Value', 'Multiple Choice', 'Fill the Blanks'].map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <button 
                onClick={() => setStep('measurements')}
                disabled={
                  (state.selectedTask === 'custom' && !state.customTask.trim()) ||
                  (state.geometricShape === 'Combination of Shapes' && state.selectedSubShapes.length === 0)
                }
                className="w-full py-5 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
              >
                Next Step
                <ChevronRight className="w-5 h-5" />
              </button>

              <button 
                onClick={startOver}
                className="w-full py-3 text-slate-500 rounded-2xl font-semibold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Use a different photo
              </button>
            </div>
          </div>
        );

      case 'measurements':
        const measurementFields = getCurrentMeasurementFields();

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-3xl shadow-md overflow-hidden border border-slate-100">
                <img src={state.image!} alt="Uploaded" className="w-full h-auto rounded-2xl" />
              </div>
              <div className="bg-slate-900 p-8 rounded-3xl text-white space-y-4">
                <div className="flex items-center gap-3 text-indigo-400">
                  <Calculator className="w-6 h-6" />
                  <h3 className="text-xl font-bold">Task Context</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-slate-400 text-sm uppercase tracking-widest font-semibold">Selected Task</p>
                  <p className="text-lg font-medium">{state.selectedTask === 'custom' ? state.customTask : state.selectedTask}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-slate-400 text-sm uppercase tracking-widest font-semibold">Geometric Shape</p>
                  <p className="text-lg font-medium">{state.geometricShape}</p>
                </div>
              </div>
            </div>

            <div className="space-y-8 bg-white p-10 rounded-3xl shadow-2xl border border-slate-100">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Input Measurements</h2>
                <p className="text-slate-500">Provide real-world values to generate the solution.</p>
              </div>

              <div className="space-y-6">
                {measurementFields.map(field => (
                  <div key={field} className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-700">{field}</label>
                    <input 
                      type="number" 
                      value={state.measurements[field] || ''}
                      onChange={(e) => setState(prev => ({ 
                        ...prev, 
                        measurements: { ...prev.measurements, [field]: e.target.value } 
                      }))}
                      className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-lg"
                      placeholder="0.00"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setStep('suggestions')}
                  className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Back
                </button>
                <button 
                  onClick={handleGenerate}
                  disabled={loading}
                  className="flex-[2] py-5 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex flex-col items-center justify-center disabled:opacity-50"
                >
                  {loading ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Generating...</span>
                      </div>
                      <span className="text-[10px] font-normal opacity-70">May take 15-30 seconds</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>Generate Task</span>
                    </div>
                  )}
                </button>
              </div>
              
              {loading && (
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 animate-pulse">
                  <p className="text-sm text-indigo-700 font-medium text-center">
                    {loadingMessage}
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'output':
        const task = state.generatedTask;
        if (!task) return null;

        const TaskSection = ({ t, index, isSubtask = false }: { t: any, index?: number, isSubtask?: boolean, key?: any }) => (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isSubtask && (
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-200" />
                <h2 className="text-2xl font-bold text-slate-400 uppercase tracking-widest">Subtask {index}</h2>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                {/* Basic Data */}
                <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-indigo-500" />
                      Basic Data
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2 group relative">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Title</p>
                      <div className="flex items-center justify-between">
                        <p className="text-2xl font-semibold text-slate-800">{t.title}</p>
                        <button onClick={() => copyToClipboard(t.title)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 group relative">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Definition</p>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-slate-600 leading-relaxed">{t.definition}</p>
                        <button onClick={() => copyToClipboard(t.definition)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors flex-shrink-0">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Solution */}
                <section className="bg-slate-900 p-8 rounded-3xl shadow-xl text-white space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-indigo-400" />
                      LaTeX Rendered Solution
                    </h3>
                    <button 
                      onClick={() => copyToClipboard(t.solution)} 
                      className="p-2 text-slate-400 hover:text-indigo-400 transition-colors"
                      title="Copy LaTeX Source"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700 overflow-x-auto min-h-[100px]">
                    <div className="w-full text-left">
                      <LatexRenderer text={t.solution} />
                    </div>
                  </div>
                  <details className="group">
                    <summary className="text-xs font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-indigo-400 transition-colors list-none flex items-center gap-2">
                      <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                      View Raw LaTeX Source
                    </summary>
                    <pre className="mt-4 p-4 bg-black/30 rounded-xl text-xs font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap">
                      {t.solution}
                    </pre>
                  </details>
                </section>

                {/* Hints */}
                <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-amber-500" />
                      Stepped Hints
                    </h3>
                    <button onClick={() => copyToClipboard(t.hints.join('\n'))} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    {t.hints.map((hint: string, i: number) => (
                      <div key={i} className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 group relative">
                        <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-sm">
                          {i + 1}
                        </span>
                        <div className="text-slate-600 text-sm leading-relaxed flex-1">
                          <LatexRenderer text={hint} />
                        </div>
                        <button onClick={() => copyToClipboard(hint)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100 transition-opacity">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                {/* Answer Format */}
                <section className="bg-indigo-600 p-8 rounded-3xl shadow-lg text-white space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">Answer Format</h3>
                    <button onClick={() => copyToClipboard(state.answerFormat)} className="p-2 text-white/40 hover:text-white transition-colors">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="bg-white/10 p-6 rounded-2xl border border-white/10 space-y-4">
                    <div className="flex justify-center">
                      <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-widest">
                        {state.answerFormat}
                      </span>
                    </div>
                    
                    {state.answerFormat === 'Interval' && t.intervalValues && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-5 gap-2 text-center">
                          {['a', 'b', 'x', 'c', 'd'].map((k) => {
                            const val = (t.intervalValues as any)[k] !== undefined ? (t.intervalValues as any)[k] : (t.intervalValues as any)[k.toUpperCase()];
                            const isAccurate = k === 'x';
                            const isOuter = k === 'a' || k === 'd';
                            const isInner = k === 'b' || k === 'c';
                            
                            return (
                              <div key={k} className="space-y-1">
                                <p className="text-[10px] font-bold opacity-60 uppercase">{k}</p>
                                <div className={cn(
                                  "p-2 rounded-lg font-bold text-sm",
                                  isAccurate ? "bg-white text-indigo-600" : 
                                  isOuter ? "bg-orange-500 text-white" : 
                                  isInner ? "bg-emerald-500 text-white" : ""
                                )}>
                                  {val}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-white/80">
                            <span className="inline-block w-2 h-2 bg-white rounded-full mr-1"></span> x: Accurate Answer
                          </p>
                        </div>
                      </div>
                    )}
                    {state.answerFormat === 'Exact Value' && (
                      <p className="text-2xl font-bold text-center">{t.answerValue}</p>
                    )}
                    {state.answerFormat === 'Multiple Choice' && t.mcOptions && (
                      <div className="space-y-2">
                        {['A', 'B', 'C', 'D'].map(opt => (
                          <div key={opt} className={cn(
                            "p-2 rounded-lg text-sm flex items-center gap-2",
                            t.mcOptions?.correct === opt ? "bg-emerald-500/30 border border-emerald-500/50" : "bg-white/5"
                          )}>
                            <span className="font-bold">{opt}:</span>
                            <span>{(t.mcOptions as any)[opt]}</span>
                            {t.mcOptions?.correct === opt && <Check className="w-3 h-3 ml-auto" />}
                          </div>
                        ))}
                      </div>
                    )}
                    {state.answerFormat === 'Fill the Blanks' && t.fillBlanks && (
                      <div className="space-y-2">
                        <p className="text-sm italic opacity-80">Statement with blanks:</p>
                        <p className="text-sm font-medium">{t.fillBlanks.statement}</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Metadata */}
                {!isSubtask && (
                  <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-slate-900">Task Metadata</h3>
                      <button onClick={() => copyToClipboard(`About: ${t.aboutObject}\nGrade: ${state.grade}\nTools: ${state.tools.join(', ')}\nTags: ${state.tags.join(', ')}`)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Info className="w-4 h-4" />
                          <p className="text-xs font-bold uppercase tracking-widest">About Object</p>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">{t.aboutObject}</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-slate-400">
                          <GraduationCap className="w-4 h-4" />
                          <p className="text-xs font-bold uppercase tracking-widest">Grade</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-800">{state.grade}</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Calculator className="w-4 h-4" />
                          <p className="text-xs font-bold uppercase tracking-widest">Tools</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {state.tools.map((tool: string) => (
                            <span key={tool} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">{tool}</span>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Tag className="w-4 h-4" />
                          <p className="text-xs font-bold uppercase tracking-widest">Tags</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {state.tags.map((tag: string) => (
                            <span key={tag} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">#{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        );

        return (
          <div className="space-y-12">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-4xl font-bold text-slate-900">Generated Task</h1>
                <p className="text-slate-500 flex items-center gap-2">
                  Review and copy your STEM task sections.
                  {savedId && (
                    <button onClick={() => goTo('tasks')} className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-sm hover:underline">
                      <CheckCircle2 className="w-4 h-4" />
                      Saved to Tasks
                    </button>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={startOver}
                  className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  New Photo
                </button>
                <button 
                  onClick={() => setStep('suggestions')}
                  className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Task
                </button>
                <button 
                  onClick={() => copyToClipboard(JSON.stringify(task, null, 2))}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-md transition-all flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy All
                </button>
              </div>
            </div>

            <TaskSection t={task} />
            
            {task.subtasks && task.subtasks.length > 0 && (
              <div className="space-y-12 mt-12">
                {task.subtasks.map((sub: any, i: number) => (
                  <TaskSection key={i} t={sub} index={i + 1} isSubtask />
                ))}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => goTo('dashboard')}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <span className="hidden sm:inline text-xl font-bold tracking-tight">MathTrails AI</span>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2">
            {([['dashboard', 'Dashboard'], ['tasks', 'Tasks'], ['help', 'Help']] as [Page, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => goTo(key)}
                className={cn(
                  "px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5",
                  page === key ? "text-indigo-600 bg-indigo-50" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {label}
                {key === 'tasks' && savedTasks.length > 0 && (
                  <span className="min-w-5 h-5 px-1.5 bg-indigo-600 text-white rounded-full text-[11px] leading-5 text-center">
                    {savedTasks.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={page === 'dashboard' ? step : page}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {page === 'tasks' ? (
              <TasksPage
                tasks={savedTasks}
                onOpen={openSavedTask}
                onDelete={(id) => {
                  setSavedTasks(deleteTask(id));
                  if (id === savedId) setSavedId(null);
                }}
                onCreate={startOver}
              />
            ) : page === 'help' ? (
              <HelpPage onStart={startOver} />
            ) : (
              renderStep()
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-slate-200 py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-slate-400 text-sm">
            © 2026 MathTrails AI. Professional STEM Task Maker for Math Trails Learning.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-slate-400 hover:text-slate-900 text-sm transition-colors">Privacy Policy</a>
            <a href="#" className="text-slate-400 hover:text-slate-900 text-sm transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>

      {/* Copied Toast */}
      {copied && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Copied to clipboard
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-8 right-8 bg-white border-2 border-red-100 p-6 rounded-3xl shadow-2xl flex flex-col gap-4 max-w-sm animate-in slide-in-from-right-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-900">{error.message}</p>
              <p className="text-sm text-slate-500 leading-relaxed">{error.details}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {error.retry && (
              <button 
                onClick={() => {
                  const retry = error.retry;
                  setError(null);
                  retry?.();
                }}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            )}
            <button 
              onClick={() => setError(null)} 
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
