import React from 'react';
import { Camera, ListChecks, Ruler, Sparkles, FolderOpen, ChevronRight } from 'lucide-react';

const STEPS = [
  {
    icon: Camera,
    title: 'Upload a photo',
    text: 'Take or choose a photo of a real object at your trail location, such as a bench, a window, a statue base or a water tank. Drag it into the upload box or click to select it.',
  },
  {
    icon: ListChecks,
    title: 'Check the AI suggestions',
    text: 'The AI names the object, picks its geometric shape and suggests three tasks. Edit the name or shape if needed, pick a task (or write your own), then choose the number of subtasks and the answer format.',
  },
  {
    icon: Ruler,
    title: 'Enter your measurements',
    text: 'Measure the real object and type the values. The AI uses them to compute the correct answer, but never reveals them in the task text, so students still have to measure on site.',
  },
  {
    icon: Sparkles,
    title: 'Review and copy',
    text: 'You get a title, task definition, a full LaTeX solution, three stepped hints and the answer in your chosen format. Use the copy buttons to paste each part into your Math Trail app.',
  },
  {
    icon: FolderOpen,
    title: 'Find it again in Tasks',
    text: 'Every generated task is saved automatically under Tasks in this browser. Open, search, delete or download them there.',
  },
];

const FORMATS = [
  ['Exact Value', 'A single correct number or short answer.'],
  ['Interval', 'Five values a < b < x < c < d: x is the accurate answer, b–c is the fully correct range and a–d is the partially correct range, allowing for measurement error.'],
  ['Multiple Choice', 'Four options A–D with one correct answer.'],
  ['Fill the Blanks', 'A sentence with blanks the student completes.'],
];

const FAQ = [
  ['Image analysis failed. What now?', 'Use a clear, well-lit photo where the object fills most of the frame, then press Retry. If it keeps failing, wait a minute: the AI service may be busy.'],
  ['Where are my tasks stored?', 'In this browser only. Clearing browser data or switching device will not carry them over, so use “Download all” on the Tasks page to keep a backup.'],
  ['Which photo formats work?', 'JPG, PNG and WebP. iPhone HEIC photos may not open in every browser; set the camera to “Most Compatible” or convert them first.'],
  ['Can I change a generated task?', 'Yes. Click “Edit Task” on the result page, adjust the settings or measurements and generate again.'],
];

export default function HelpPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="max-w-4xl mx-auto space-y-14">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold text-slate-900">How to use MathTrails AI</h1>
        <p className="text-slate-500 text-lg">
          Turn a photo of a real object into a ready-to-use Math Trail task in five steps.
        </p>
      </div>

      <ol className="space-y-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex gap-5 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <Icon className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">
                {i + 1}. {title}
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Answer formats</h2>
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm divide-y divide-slate-100">
          {FORMATS.map(([name, text]) => (
            <div key={name} className="p-5 sm:flex gap-6">
              <p className="font-semibold text-slate-900 sm:w-40 flex-shrink-0">{name}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Math Trail principles</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Generated tasks follow four principles: <b>Presence</b> (solvable only at the object),{' '}
          <b>Activity</b> (students measure, count or estimate), <b>Reality</b> (authentic objects) and{' '}
          <b>Clarity</b> (unambiguous instructions).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Questions</h2>
        <div className="space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group bg-white rounded-2xl border border-slate-100 p-5">
              <summary className="font-semibold text-slate-900 cursor-pointer list-none flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform" />
                {q}
              </summary>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed pl-6">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <button
        onClick={onStart}
        className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
      >
        Start creating a task
      </button>
    </div>
  );
}
