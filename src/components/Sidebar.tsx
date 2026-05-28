import React, { useState } from 'react';
import { QuizType } from '../types';
import { Book, BookOpen, Quote, FileText, Eraser, AlertCircle, Calculator, Brain, Sparkles, RefreshCw } from 'lucide-react';

interface SidebarProps {
  selectedQuizType: QuizType;
  setSelectedQuizType: (type: QuizType) => void;
  theme?: string;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

const quizTypes: { type: QuizType, icon: React.FC<any>, label: string }[] = [
  { type: 'GK', icon: Book, label: '📚 GK Quiz' },
  { type: 'Passage', icon: BookOpen, label: '📖 Passage Quiz' },
  { type: 'Vocabulary', icon: Quote, label: '📝 Vocabulary Quiz' },
  { type: 'Parajumble', icon: FileText, label: '🔄 Parajumble Quiz' },
  { type: 'Cloze', icon: Eraser, label: '✏️ Cloze Test' },
  { type: 'Error Correction', icon: AlertCircle, label: '🔍 Error Correction' },
  { type: 'Math', icon: Calculator, label: '🧮 Math Quiz' },
  { type: 'Reasoning', icon: Brain, label: '🧠 Reasoning Quiz' }
];

export default function Sidebar({ selectedQuizType, setSelectedQuizType, theme, isSidebarOpen, setIsSidebarOpen }: SidebarProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Unregister PWA service workers if supported
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      // Delete all cached storage items
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }
      console.log('[QUIZ-BUILDER-AI] Caches successfully cleared and PWA updated.');
    } catch (e) {
      console.error('Failed to unregister sw or clear caches:', e);
    }
    
    // Tiny delay to show the spinner animation to user
    setTimeout(() => {
      window.location.reload();
    }, 850);
  };

  return (
    <>
      {/* Semi-transparent backdrop to dismiss drawer on mobile tap */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 md:hidden backdrop-blur-[1px] transition-all duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-zinc-900 h-full text-gray-800 dark:text-zinc-200 flex flex-col border-r border-[#E5E7EB] dark:border-zinc-800 transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 pb-4">
          <h1 className="serif italic text-3xl tracking-tight text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-2">
            Aether <Sparkles size={16} className="text-emerald-700/70 dark:text-emerald-400/75" />
          </h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 dark:text-zinc-500 font-bold">Quiz Console</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          <div className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3 px-4 mt-4">Quiz Modules</div>
          {quizTypes.map((qt) => {
            const Icon = qt.icon;
            const isActive = qt.type === selectedQuizType;
            return (
              <button
                key={qt.type}
                onClick={() => {
                  setSelectedQuizType(qt.type);
                  setIsSidebarOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl flex items-center transition-all text-sm font-semibold cursor-pointer border-none
                  ${isActive 
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-l-4 border-emerald-600 dark:border-emerald-500 text-emerald-900 dark:text-emerald-300 shadow-sm' 
                    : 'text-gray-500 dark:text-zinc-400 hover:text-emerald-800 dark:hover:text-emerald-350 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 border-l-4 border-transparent'}
                `}
              >
                {isActive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-650 dark:bg-emerald-500 mr-3 shadow-[0_0_6px_rgba(16,185,129,0.5)]"></span>
                ) : (
                  <span className="w-1.5 h-1.5 mr-3 border-transparent"></span>
                )}
                <Icon size={16} className={`mr-2 opacity-80 ${isActive ? 'text-emerald-750 dark:text-emerald-400' : 'text-emerald-700 dark:text-emerald-400'}`} />
                {qt.label.split(' ').slice(1).join(' ')}
              </button>
            )
          })}
        </nav>

        {/* Premium Reload/Sync Button Footer at the very bottom */}
        <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-neutral-50/40 dark:bg-zinc-950/10 transition-colors">
          <button
            onClick={handleForceRefresh}
            disabled={isRefreshing}
            className={`w-full py-3 px-4 bg-emerald-50 dark:bg-emerald-950/35 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-solid border-emerald-150 dark:border-emerald-900/40 text-emerald-850 dark:text-emerald-350 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50`}
            title="Clear Caches and Sync App Updates"
          >
            <RefreshCw size={13} className={`text-emerald-700 dark:text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Syncing Updates...' : 'Refresh & Sync App'}
          </button>
        </div>
      </aside>
    </>
  );
}
