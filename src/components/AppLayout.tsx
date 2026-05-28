import React, { useState, useEffect } from 'react';
import { QuizType, QuizConfig } from '../types';
import Sidebar from './Sidebar';
import MainPanel from './MainPanel';

export default function AppLayout() {
  const [selectedQuizType, setSelectedQuizType] = useState<QuizType>('GK');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('admin_app_theme') as 'light' | 'dark') || 'light';
    } catch (e) {
      return 'light';
    }
  });

  // Synchronize HTML element classes & document body styles
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      document.body.style.backgroundColor = '#09090b'; // zinc-950 dark bg
      document.body.style.color = '#f4f4f5'; // zinc-100 dark text
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.body.style.backgroundColor = '#fafafa'; // light slate bg
      document.body.style.color = '#111827'; // slate-900 light text
    }
  }, [theme]);
  
  const [config, setConfig] = useState<QuizConfig>({
    title: 'Bilingual GK Quiz',
    subtitle: 'Select language and test your knowledge',
    totalTime: 480,
    marksCorrect: 2.0,
    marksWrong: -0.5,
    maxQuestions: 0,
    gsUrl: 'https://script.google.com/macros/s/AKfycby4OuRL-wnpvEtZPUcO61v6IIWpHcffUdVbMSteEZoVBU9SJn8niXq-yo7bAY785TBp/exec',
    defaultLang: 'en'
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    try {
      localStorage.setItem('admin_app_theme', nextTheme);
    } catch (e) {}
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className={`flex h-screen overflow-hidden ${theme === 'dark' ? 'dark bg-zinc-950 text-zinc-100' : 'bg-gradient-to-b from-white via-neutral-50/50 to-neutral-100/40 text-gray-800'} font-sans selection:bg-emerald-600/20`}>
      <Sidebar 
        selectedQuizType={selectedQuizType}
        setSelectedQuizType={setSelectedQuizType}
        theme={theme}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MainPanel 
          quizType={selectedQuizType} 
          config={config} 
          setConfig={setConfig} 
          theme={theme}
          toggleTheme={toggleTheme}
          onToggleSidebar={() => setIsSidebarOpen(true)}
        />
      </div>
    </div>
  );
}
