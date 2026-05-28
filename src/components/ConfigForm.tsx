import React from 'react';
import { QuizType, QuizConfig } from '../types';
import { Settings, HelpCircle } from 'lucide-react';

interface ConfigFormProps {
  quizType: QuizType;
  config: QuizConfig;
  setConfig: React.Dispatch<React.SetStateAction<QuizConfig>>;
}

export default function ConfigForm({ quizType, config, setConfig }: ConfigFormProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const isBilingual = quizType === 'GK' || quizType === 'Math' || quizType === 'Reasoning';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-800 p-6 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-5 transition-colors">
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-zinc-800 pb-3">
        <Settings size={14} className="text-emerald-700 dark:text-emerald-400" />
        <h2 className="text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400 font-bold">Quiz Parameters</h2>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1.5 flex items-center justify-between font-sans">
            <span>Presentation Title</span>
            <span className="text-[9px] font-normal text-gray-400 dark:text-zinc-500 lowercase italic">Displays at start</span>
          </label>
          <input 
            type="text" 
            name="title" 
            value={config.title || ''} 
            onChange={handleChange}
            className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all placeholder-gray-300 dark:placeholder-zinc-600"
            placeholder="Enter quiz title..."
          />
        </div>
        
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1.5 font-sans">App Subtitle</label>
          <input 
            type="text" 
            name="subtitle" 
            value={config.subtitle || ''} 
            onChange={handleChange}
            className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all placeholder-gray-300 dark:placeholder-zinc-600"
            placeholder="Enter subtitle details..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1.5 font-sans">Timer (seconds)</label>
            <input 
              type="number" 
              name="totalTime" 
              value={config.totalTime} 
              onChange={handleChange}
              className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1.5 font-sans">Max Questions (0=all)</label>
            <input 
              type="number" 
              name="maxQuestions" 
              value={config.maxQuestions} 
              onChange={handleChange}
              className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1.5 font-sans">Marks Correct</label>
            <input 
              type="number" 
              step="0.1"
              name="marksCorrect" 
              value={config.marksCorrect} 
              onChange={handleChange}
              className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1.5 font-sans">Marks Wrong (Negative)</label>
            <input 
              type="number" 
              step="0.1"
              name="marksWrong" 
              value={config.marksWrong} 
              onChange={handleChange}
              className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1.5 flex items-center justify-between font-sans">
            <span>Google Sheet Script URL</span>
            <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-normal lowercase tracking-wide flex items-center gap-0.5" title="Triggered on player submission">
              <HelpCircle size={10} /> Sync records
            </span>
          </label>
          <input 
            type="text" 
            name="gsUrl" 
            value={config.gsUrl || ''} 
            onChange={handleChange}
            placeholder="https://script.google.com/macros/s/..."
            className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all placeholder-gray-300 dark:placeholder-zinc-650"
          />
        </div>

        {isBilingual && (
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1.5 font-sans">Default Language</label>
            <select 
              name="defaultLang" 
              value={config.defaultLang || 'en'} 
              onChange={handleChange}
              className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all cursor-pointer"
            >
              <option value="en" className="bg-white dark:bg-zinc-900 text-gray-800 dark:text-zinc-100">English</option>
              <option value="bn" className="bg-white dark:bg-zinc-900 text-gray-800 dark:text-zinc-100">Bengali / বাংলা</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
