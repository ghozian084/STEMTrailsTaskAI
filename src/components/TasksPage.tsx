import React, { useState } from 'react';
import { Download, FolderOpen, Search, Trash2, Plus } from 'lucide-react';
import type { SavedTask } from '../lib/savedTasks';

interface Props {
  tasks: SavedTask[];
  onOpen: (task: SavedTask) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

export default function TasksPage({ tasks, onOpen, onDelete, onCreate }: Props) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? tasks.filter((t) =>
        [t.task.title, t.objectName, t.geometricShape, t.grade, ...t.tags].join(' ').toLowerCase().includes(q)
      )
    : tasks;

  const downloadAll = () => {
    const data = tasks.map(({ image, thumbnail, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mathtrails-tasks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-slate-900">My Tasks</h1>
          <p className="text-slate-500">
            Every task you generate is saved here automatically, in this browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {tasks.length > 0 && (
            <button
              onClick={downloadAll}
              className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download all
            </button>
          )}
          <button
            onClick={onCreate}
            className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-md transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-24 bg-white rounded-3xl border border-slate-100 space-y-4">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <FolderOpen className="w-8 h-8 text-indigo-600" />
          </div>
          <p className="text-xl font-semibold text-slate-900">No tasks yet</p>
          <p className="text-slate-500 max-w-sm">Upload a photo on the Dashboard to generate your first Math Trail task.</p>
          <button
            onClick={onCreate}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all"
          >
            Create a task
          </button>
        </div>
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, object, shape, grade or tag"
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-slate-500">No tasks match “{query}”.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                >
                  <button onClick={() => onOpen(t)} className="text-left flex-1 flex flex-col">
                    <img src={t.thumbnail} alt={t.objectName} className="w-full h-44 object-cover bg-slate-100" />
                    <div className="p-5 space-y-2 flex-1">
                      <p className="text-lg font-semibold text-slate-900">{t.task.title}</p>
                      <p className="text-sm text-slate-500">
                        {t.objectName} · {t.geometricShape}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">{t.grade}</span>
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">{t.answerFormat}</span>
                        {t.task.subtasks && t.task.subtasks.length > 0 && (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                            {t.task.subtasks.length} subtask{t.task.subtasks.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400">{new Date(t.savedAt).toLocaleString()}</span>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${t.task.title}"?`)) onDelete(t.id);
                      }}
                      className="p-2 text-slate-300 hover:text-red-600 transition-colors"
                      title="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
