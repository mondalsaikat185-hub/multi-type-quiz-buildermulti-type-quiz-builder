import React, { useState, useEffect } from 'react';
import { QuizType, QuizConfig } from '../types';
import ConfigForm from './ConfigForm';
import GeneratorPanel from './GeneratorPanel';
import KeyManager from './KeyManager';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { RefreshCw, ClipboardList, Sun, Moon } from 'lucide-react';

interface MainPanelProps {
  quizType: QuizType;
  config: QuizConfig;
  setConfig: React.Dispatch<React.SetStateAction<QuizConfig>>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export default function MainPanel({ quizType, config, setConfig, theme, toggleTheme }: MainPanelProps) {
  const [customKeys, setCustomKeys] = useState<string[]>([]);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  
  // Dynamic persistent configuration syncer
  useEffect(() => {
    let isMounted = true;
    setIsConfigLoading(true);

    async function fetchConfig() {
      try {
        const docRef = doc(db, 'quizzes', `config_${quizType}`);
        const docSnap = await getDoc(docRef);
        
        if (!isMounted) return;

        if (docSnap.exists()) {
          const loadedData = docSnap.data();
          const restoredConfig: QuizConfig = {
            title: loadedData.title || '',
            subtitle: loadedData.subtitle || '',
            totalTime: Number(loadedData.totalTime) || 0,
            marksCorrect: Number(loadedData.marksCorrect) || 0,
            marksWrong: Number(loadedData.marksWrong) || 0,
            maxQuestions: Number(loadedData.maxQuestions) || 0,
            gsUrl: loadedData.gsUrl || 'https://script.google.com/macros/s/AKfycby4OuRL-wnpvEtZPUcO61v6IIWpHcffUdVbMSteEZoVBU9SJn8niXq-yo7bAY785TBp/exec',
            defaultLang: loadedData.defaultLang || 'en'
          };
          setConfig(restoredConfig);
        } else {
          // Document does not exist yet. Determine default fallback config
          let fallback: QuizConfig;
          const userGsUrl = 'https://script.google.com/macros/s/AKfycby4OuRL-wnpvEtZPUcO61v6IIWpHcffUdVbMSteEZoVBU9SJn8niXq-yo7bAY785TBp/exec';
          switch (quizType) {
            case 'GK':
              fallback = { title: 'Bilingual GK Quiz', subtitle: 'Select language and test your knowledge', totalTime: 480, marksCorrect: 2.0, marksWrong: -0.5, maxQuestions: 0, gsUrl: userGsUrl, defaultLang: 'en' };
              break;
            case 'Passage':
              fallback = { title: 'English Comprehension Practice', subtitle: 'Read the passage and answer the questions', totalTime: 600, marksCorrect: 2.0, marksWrong: -0.5, maxQuestions: 0, gsUrl: userGsUrl, defaultLang: 'en' };
              break;
            case 'Vocabulary':
              fallback = { title: 'English Vocabulary Quiz', subtitle: 'Synonyms, Antonyms, Idioms & More', totalTime: 300, marksCorrect: 1.0, marksWrong: 0.0, maxQuestions: 0, gsUrl: userGsUrl, defaultLang: 'en' };
              break;
            case 'Parajumble':
              fallback = { title: 'English Parajumble Quiz', subtitle: 'Arrange the sentences in the correct order', totalTime: 600, marksCorrect: 2.0, marksWrong: -0.5, maxQuestions: 0, gsUrl: userGsUrl, defaultLang: 'en' };
              break;
            case 'Cloze':
              fallback = { title: 'English Cloze Test', subtitle: 'Fill in the blanks with the correct word', totalTime: 600, marksCorrect: 1.0, marksWrong: 0.0, maxQuestions: 0, gsUrl: userGsUrl, defaultLang: 'en' };
              break;
            case 'Error Correction':
              fallback = { title: 'English Error Correction Quiz', subtitle: 'Identify the segment containing the grammatical error', totalTime: 1800, marksCorrect: 2.0, marksWrong: -0.5, maxQuestions: 0, gsUrl: userGsUrl, defaultLang: 'en' };
              break;
            case 'Math':
              fallback = { title: 'Math Practice Quiz', subtitle: 'Bilingual · Choose language · Answer all questions', totalTime: 1800, marksCorrect: 1.0, marksWrong: 0.0, maxQuestions: 0, gsUrl: userGsUrl, defaultLang: 'en' };
              break;
            case 'Reasoning':
              fallback = { title: 'Reasoning Practice Quiz', subtitle: 'Bilingual · Choose language · Answer all questions', totalTime: 1800, marksCorrect: 1.0, marksWrong: 0.0, maxQuestions: 0, gsUrl: userGsUrl, defaultLang: 'en' };
              break;
          }
          setConfig(fallback);
          // Pre-save defaults to cloud
          await setDoc(docRef, { ...fallback, updatedAt: new Date().toISOString() });
        }
      } catch (err) {
        console.error(`Error loading cloud config for ${quizType}:`, err);
      } finally {
        if (isMounted) {
          setIsConfigLoading(false);
        }
      }
    }

    fetchConfig();

    return () => {
      isMounted = false;
    };
  }, [quizType, setConfig]);

  // Debounced auto-save config changes back to cloud
  useEffect(() => {
    if (isConfigLoading) return;
    if (!config) return;

    const saveTimer = setTimeout(async () => {
      try {
        const cleanConfig = Object.fromEntries(
          Object.entries(config).filter(([_, v]) => v !== undefined)
        );
        const docRef = doc(db, 'quizzes', `config_${quizType}`);
        await setDoc(docRef, {
          ...cleanConfig,
          updatedAt: new Date().toISOString()
        });
        console.log(`Successfully synced cloud configurations for ${quizType}`);
      } catch (err) {
        console.error(`Failed to automatically sync settings for ${quizType}:`, err);
      }
    }, 800); // 800ms debounce

    return () => clearTimeout(saveTimer);
  }, [config, quizType, isConfigLoading]);

  return (
    <div className="flex-1 overflow-auto flex flex-col bg-[#FAFAFA] dark:bg-zinc-950 transition-colors">
      <header className="h-20 border-b border-gray-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-10 shrink-0 transition-colors">
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase font-bold tracking-[0.25em] text-gray-400 dark:text-zinc-500 font-sans">Quiz Studio</span>
          <h2 className="serif text-2xl italic text-gray-900 dark:text-zinc-100 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-700/80 dark:text-emerald-400/85" /> {quizType} Builder
          </h2>
        </div>
        
        <div className="flex items-center gap-6">
          {isConfigLoading && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500 italic font-sans">
              <RefreshCw size={12} className="animate-spin text-emerald-700 dark:text-emerald-400" />
              Syncing database configurations...
            </div>
          )}
          
          <button 
            onClick={toggleTheme}
            id="theme-toggler"
            className="flex items-center justify-center p-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 cursor-pointer border-none shadow-sm transition-all"
            title="Toggle Light/Dark Theme"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} className="text-yellow-400" />}
          </button>
        </div>
      </header>

      <div className="p-10 flex-1 flex flex-col gap-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className={`${isConfigLoading ? 'opacity-40 pointer-events-none' : ''} transition-opacity duration-300`}>
              <ConfigForm quizType={quizType} config={config} setConfig={setConfig} />
            </div>
            <KeyManager onKeysChanged={(keys) => setCustomKeys(keys.map(k => k.key))} />
          </div>
          <div className="lg:col-span-3">
            <GeneratorPanel quizType={quizType} config={config} customKeys={customKeys} />
          </div>
        </div>
      </div>
    </div>
  );
}
