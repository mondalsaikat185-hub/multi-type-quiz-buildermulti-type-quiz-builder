import React, { useState, useEffect } from 'react';
import { QuizType, QuizConfig } from '../types';
import { splitQuestionBlocks } from '../utils/textSplitter';
import { generateZipBundle, getSingleHtmlTemplate } from '../utils/zipBuilder';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ClipboardCheck, Sparkles, AlertCircle, RefreshCw, Layers, Download, Check, FileCode, Archive } from 'lucide-react';

interface GeneratorPanelProps {
  quizType: QuizType;
  config: QuizConfig;
  customKeys?: string[];
}

export default function GeneratorPanel({ quizType, config, customKeys = [] }: GeneratorPanelProps) {
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detectedCount, setDetectedCount] = useState<number | null>(null);
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number>(0);
  const [parsedData, setParsedData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [modelName, setModelName] = useState('gemini-2.0-flash');
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [lastLoadedQuizType, setLastLoadedQuizType] = useState<QuizType | null>(null);
  const [liveDetectedCount, setLiveDetectedCount] = useState<number>(0);
  const [isBatchMode, setIsBatchMode] = useState<boolean>(() => localStorage.getItem('quiz_builder_is_batch') !== 'false');

  useEffect(() => {
    localStorage.setItem('quiz_builder_is_batch', String(isBatchMode));
  }, [isBatchMode]);

  // Load from Firebase
  useEffect(() => {
    setIsLoaded(false);
    setLastLoadedQuizType(null);
    async function loadData() {
      try {
        const docRef = doc(db, 'quizzes', quizType);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRawText(data.rawText || '');
          setParsedData(data.parsedData || null);
          setDetectedCount(data.detectedCount !== undefined ? data.detectedCount : null);
        } else {
          const localString = localStorage.getItem(`quiz_backup_${quizType}`);
          if (localString) {
            try {
              const localData = JSON.parse(localString);
              setRawText(localData.rawText || '');
              setParsedData(localData.parsedData || null);
              setDetectedCount(localData.detectedCount !== undefined ? localData.detectedCount : null);
            } catch (err) {
              setRawText('');
              setParsedData(null);
              setDetectedCount(null);
            }
          } else {
            setRawText('');
            setParsedData(null);
            setDetectedCount(null);
          }
        }
      } catch (e) {
        console.error("Error loading from firebase", e);
        const localString = localStorage.getItem(`quiz_backup_${quizType}`);
        if (localString) {
          try {
            const localData = JSON.parse(localString);
            setRawText(localData.rawText || '');
            setParsedData(localData.parsedData || null);
            setDetectedCount(localData.detectedCount !== undefined ? localData.detectedCount : null);
          } catch (err) {
            setRawText('');
            setParsedData(null);
            setDetectedCount(null);
          }
        } else {
          setRawText('');
          setParsedData(null);
          setDetectedCount(null);
        }
      } finally {
        setLastLoadedQuizType(quizType);
        setIsLoaded(true);
      }
    }
    loadData();
  }, [quizType]);

  // Real-time live detection tracker 
  useEffect(() => {
    if (!rawText.trim()) {
      setLiveDetectedCount(0);
      return;
    }
    try {
      const blocks = splitQuestionBlocks(rawText, quizType);
      setLiveDetectedCount(blocks.length);
    } catch (err) {
      setLiveDetectedCount(0);
    }
  }, [rawText, quizType]);

  // Debounced auto-saves rawText & state, avoiding deletion on empty states prior to loading
  useEffect(() => {
    if (!isLoaded || isProcessing) return;
    if (lastLoadedQuizType !== quizType) return;

    const saveTimer = setTimeout(async () => {
      try {
        const docRef = doc(db, 'quizzes', quizType);
        await setDoc(docRef, {
          rawText,
          parsedData,
          detectedCount,
          updatedAt: new Date().toISOString()
        });
        
        localStorage.setItem(`quiz_backup_${quizType}`, JSON.stringify({
          rawText,
          parsedData,
          detectedCount
        }));
        
        console.log(`Successfully backed up raw and parsed text for ${quizType}`);
      } catch (err) {
        console.error("Failed to backup raw input content to Firebase:", err);
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(saveTimer);
  }, [rawText, parsedData, detectedCount, quizType, isLoaded, lastLoadedQuizType, isProcessing]);

  const handleGenerate = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setProgress(0);
    setErrorMsg('');
    setParsedData(null);
    setDetectedCount(null);
    setCurrentBlockIndex(0);

    // 1. Filter out masked keys, only sending valid unmasked keys to server
    const validCustomKeys = customKeys.filter(k => k && k.startsWith('AIzaSy') && !k.includes('...'));

    // 2. Set dynamic pacing delay based on model RPM limits.
    // gemini-2.5-flash/pro: 10 RPM → 7s delay | gemini-2.0-flash: 15 RPM → 4.5s delay
    const isSlowRpmModel = modelName.includes('2.5') || modelName.includes('pro');
    const pacingDelayMs = isSlowRpmModel ? 7000 : 4500;

    try {
      if (isBatchMode) {
        // --- SMART BATCH MODE ---
        // Passage/Cloze: TRUE single API call (entire text at once — 1 RPM used)
        console.log(`[QUIZ-BUILDER-AI] Parsing in Smart Batch Mode...`);

        let allExtractedQuestions: any[] = [];
        let finalCount = 0;
        let passageText = '';

        if (quizType === 'Passage' || quizType === 'Cloze') {
          // ---- TRUE SINGLE-CALL BATCH for Passage/Cloze ----
          // Send the ENTIRE rawText in one API call — Gemini returns { passage, questions[] }
          setCurrentBlockIndex(1);
          setProgress(10);
          console.log('[QUIZ-BUILDER-AI] Passage/Cloze: sending full text in ONE API call...');

          const response = await fetch('/api/parse-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawText: rawText.trim(),
              quizType,
              modelName,
              customKeys: validCustomKeys,
              isBatch: true,
              passageContext: ''
            })
          });

          // --- Handle Passage/Cloze single-call response ---
          if (!response.ok) {
            let errMsg = `Server error ${response.status}`;
            try { const d = await response.json(); errMsg = d.error || errMsg; }
            catch { try { const t = await response.text(); if (t) errMsg = t.substring(0, 200); } catch {} }
            throw new Error(errMsg);
          }
          let passResData: any;
          try { passResData = await response.json(); }
          catch {
            let bt = ''; try { bt = await response.text(); } catch {}
            throw new Error(`JSON parse failed. Response: ${bt.substring(0, 200)}`);
          }
          const passExtracted = passResData?.data;
          if (passExtracted && typeof passExtracted === 'object' && !Array.isArray(passExtracted)) {
            passageText = passExtracted.passage || '';
            allExtractedQuestions = Array.isArray(passExtracted.questions) ? passExtracted.questions : [];
          } else if (Array.isArray(passExtracted)) {
            allExtractedQuestions = passExtracted;
          }
          setProgress(90);

        } else {
          // ---- CHUNKED BATCH for all other quiz types (GK, Math, Reasoning, Vocabulary, Parajumble, Error) ----
          const CHUNK_SIZE = 5; // Reduced from 10 to 5 questions to completely bypass Vercel 10s timeout
          const blocks = splitQuestionBlocks(rawText, quizType);
          const chunks: string[] = [];
          for (let j = 0; j < blocks.length; j += CHUNK_SIZE) {
            chunks.push(blocks.slice(j, j + CHUNK_SIZE).join('\n\n'));
          }
          if (chunks.length === 0) chunks.push(rawText.trim());

          for (let ci = 0; ci < chunks.length; ci++) {
            setCurrentBlockIndex(ci + 1);
            setProgress(((ci) / chunks.length) * 90);

            // Dynamic Pacing Delay to respect Gemini RPM rate limit
            if (ci > 0) {
              console.log(`[QUIZ-BUILDER-AI] Waiting ${pacingDelayMs / 1000}s to avoid rate limits...`);
              await new Promise(resolve => setTimeout(resolve, pacingDelayMs));
            }

            const chunkResp = await fetch('/api/parse-quiz', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rawText: chunks[ci],
                quizType,
                modelName,
                customKeys: validCustomKeys,
                isBatch: true,
              })
            });

            if (!chunkResp.ok) {
              let errMsg = `Server error ${chunkResp.status} (chunk ${ci + 1})`;
              try { const d = await chunkResp.json(); errMsg = d.error || errMsg; }
              catch { try { const t = await chunkResp.text(); if (t) errMsg = t.substring(0, 200); } catch {} }
              throw new Error(errMsg);
            }
            let chunkResData: any;
            try { chunkResData = await chunkResp.json(); }
            catch {
              let bt = ''; try { bt = await chunkResp.text(); } catch {}
              throw new Error(`JSON parse failed for chunk ${ci + 1}. Response: ${bt.substring(0, 200)}`);
            }
            const chunkExtracted = chunkResData?.data;
            let chunkQs: any[] = [];
            if (Array.isArray(chunkExtracted)) {
              chunkQs = chunkExtracted;
            } else if (chunkExtracted && typeof chunkExtracted === 'object') {
              chunkQs = Array.isArray(chunkExtracted.questions) ? chunkExtracted.questions
                      : (Array.isArray(chunkExtracted.data) ? chunkExtracted.data : [chunkExtracted]);
            }
            allExtractedQuestions = [...allExtractedQuestions, ...chunkQs];
          }
        }

        // Re-number IDs sequentially
        allExtractedQuestions.forEach((item: any, idx: number) => { item.id = idx + 1; });

        let finalData: any = null;
        if (quizType === 'Passage' || quizType === 'Cloze') {
          finalData = { passage: passageText, questions: allExtractedQuestions };
        } else {
          finalData = allExtractedQuestions;
        }
        finalCount = allExtractedQuestions.length;

        setDetectedCount(finalCount);
        setParsedData(finalData);
        setProgress(100);

        try {
          await setDoc(doc(db, 'quizzes', quizType), {
            rawText, parsedData: finalData, detectedCount: finalCount,
            updatedAt: new Date().toISOString()
          });
          localStorage.setItem(`quiz_backup_${quizType}`, JSON.stringify({
            rawText, parsedData: finalData, detectedCount: finalCount
          }));
        } catch (err) {
          console.error('Failed to save to Firebase:', err);
        }

      } else {
        // --- SEQUENTIAL MODE (One API Request per Question Block) ---
        console.log(`[QUIZ-BUILDER-AI] Parsing questions sequentially in loops...`);
        const blocks = splitQuestionBlocks(rawText, quizType);
        
        let passageText = '';
        if (quizType === 'Passage' || quizType === 'Cloze') {
          if (blocks.length > 0 && !/^\d|Q/.test(blocks[0].substring(0, 2))) {
            passageText = blocks.shift() || '';
            passageText = passageText.replace(/^Passage( -|:)?/i, '').trim();
          }
        }

        const activeBlocksCount = blocks.length;
        setDetectedCount(activeBlocksCount);
        
        let results: any[] = [];
        
        for (let i = 0; i < activeBlocksCount; i++) {
          setCurrentBlockIndex(i + 1);
          setProgress(((i) / activeBlocksCount) * 100);
          
          if (i > 0) {
            console.log(`[QUIZ-BUILDER-AI] Waiting ${pacingDelayMs / 1000}s to avoid rate limits...`);
            await new Promise(resolve => setTimeout(resolve, pacingDelayMs));
          }
          
          const response = await fetch('/api/parse-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawText: blocks[i],
              quizType,
              modelName,
              customKeys: validCustomKeys,
              passageContext: passageText
            })
          });

          if (!response.ok) {
            let errMsg = `Server returned status ${response.status} for block ${i + 1}`;
            try {
              const errData = await response.json();
              errMsg = errData.error || errMsg;
            } catch (jsonErr) {
              try {
                const txt = await response.text();
                if (txt) errMsg = txt.substring(0, 200);
              } catch (txtErr) {}
            }
            throw new Error(errMsg);
          }

          let resData;
          try {
            resData = await response.json();
          } catch (jsonErr) {
            let bodyText = '';
            try {
              bodyText = await response.text();
            } catch (e) {}
            throw new Error(`Failed to parse server JSON response for block ${i + 1}. Body was: ${bodyText.substring(0, 200)}`);
          }
          const extracted = resData?.data;
          
          if (Array.isArray(extracted)) {
            extracted.forEach(item => {
              item.id = results.length + 1;
              results.push(item);
            });
          } else if (typeof extracted === 'object' && extracted !== null) {
            extracted.id = results.length + 1;
            results.push(extracted);
          }
        }
        
        let finalData: any = results;
        if (quizType === 'Passage' || quizType === 'Cloze') {
          finalData = {
            passage: passageText,
            questions: results
          };
        }
        
        setParsedData(finalData);
        
        try {
          await setDoc(doc(db, 'quizzes', quizType), {
            rawText,
            parsedData: finalData,
            detectedCount: activeBlocksCount,
            updatedAt: new Date().toISOString()
          });
          localStorage.setItem(`quiz_backup_${quizType}`, JSON.stringify({
            rawText,
            parsedData: finalData,
            detectedCount: activeBlocksCount
          }));
        } catch (err) {
          console.error("Failed to save state to firebase", err);
        }
      }
      
      setProgress(100);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An unknown error occurred during parsing.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSingleHtml = () => {
    if (!parsedData) return;
    const htmlString = getSingleHtmlTemplate(quizType, config, parsedData);
    const blob = new Blob([htmlString], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quizType.replace(/\s+/g, '_')}_Interactive_Quiz.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    if (!parsedData) return;
    await generateZipBundle(quizType, config, parsedData);
  };

  const handleDownloadJson = () => {
    if (!parsedData) return;
    const blob = new Blob([JSON.stringify(parsedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quizType.replace(/\s+/g, '_')}_Questions.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalQuestionsResolved = parsedData
    ? (Array.isArray(parsedData) ? parsedData.length : (parsedData.questions?.length || 0))
    : 0;

  // Per-mode format hints shown above the textarea
  function getFormatHint(qt: string): string {
    switch (qt) {
      case "GK":
        return [
          "[FORMAT] GK / সাধারণ জ্ঞান — Serial: 1. / Q1. / 1) / [1] / #1 / No.1 সব চলে",
          "প্রশ্ন: বাংলা প্রশ্ন  (A) অপশন A  (B) অপশন B  (C) অপশন C  (D) অপশন D  উত্তর: (B)",
          "Question: English text  (A) Opt A  (B) Opt B  (C) Opt C  (D) Opt D  Answer: (B)",
        ].join("\n");
      case "Vocabulary":
        return [
          "[FORMAT] Vocabulary — Serial: 1. / Q1. / 1) যেকোনো serial চলে",
          "1. Choose the synonym of BENEVOLENT:",
          "(A) Kind  (B) Cruel  (C) Lazy  (D) Brave  Correct answer: (A)  Explanation: ...",
        ].join("\n");
      case "Passage":
        return [
          "[FORMAT] Passage — passage text প্রথমে (number ছাড়া), তারপর numbered questions:",
          "[Full passage text here — any length]",
          "",
          "1. What is the main idea?  (A) Opt A  (B) Opt B  (C) Opt C  (D) Opt D  Answer: (B)",
        ].join("\n");
      case "Parajumble":
        return [
          "[FORMAT] Parajumble — Serial: 1. / Q1. / 1) যেকোনো serial চলে",
          "1. Arrange the sentences in the correct order:",
          "A. He forgot his wallet.   B. Rohan went to a restaurant.",
          "C. He called his friend.   D. The waiter brought the bill.",
          "Options: A,B,C,D  B,D,A,C  A,C,B,D  D,B,A,C   Correct option: B,D,A,C",
        ].join("\n");
      case "Cloze":
        return [
          "[FORMAT] Cloze Test — passage-এর পরে Questions: লিখুন (mandatory separator):",
          "Passage (with blanks): The journey began with an unexpected (1). Thick clouds (2) the sky.",
          "",
          "Questions:",
          "1. A) miracle  B) delay  C) disaster  D) reward  Correct Answer: B  Explanation: ...",
        ].join("\n");
      case "Error Correction":
        return [
          "[FORMAT] Error Correction — (A)(B)(C)(D) / a)b)c)d) / A.B.C.D. / [A][B] সব style চলে",
          "4-part: 1. She does not go (A) / to school (B) / daily. (C) / No Error (D)  Answer: (A)",
          "5-part: 2. He (a)/ commanded me (b)/ as if (c)/ he was (d)/ my husband. (e)No error  Ans:(c)",
          "Explanation: Use were not was in conditionals.",
        ].join("\n");
      case "Math":
        return [
          "[FORMAT] Math (Bilingual) — Serial: 1. / Q1. / ১. যেকোনো — Unicode math ব্যবহার করুন",
          "প্রশ্ন: যদি a² + b² = 25 হয়, তাহলে (a+b)² = ?",
          "(A) 25  (B) 50  (C) 25+2ab  (D) নির্ণয় করা যাবে না  উত্তর: (C)",
          "Question: If a² + b² = 25, find (a+b)².  (A) 25  (B) 50  (C) 25+2ab  (D) Cannot determine  Answer: (C)",
        ].join("\n");
      case "Reasoning":
        return [
          "[FORMAT] Reasoning (Bilingual) — Coding / Series / Blood Relation / Analogy / Syllogism",
          "1. If BOOK = CPPL, how is READ coded?",
          "   A) SFBE   B) SFBF   C) SEBE   D) TFCE   Answer: A   Explanation: Each letter +1",
          "১. যদি BOOK = CPPL হয়, READ = কত?   উত্তর: A   ব্যাখ্যা: প্রতিটি অক্ষরে +1",
        ].join("\n");
      default:
        return "";
    }
  }
  const activeHint = getFormatHint(quizType);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-full shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-colors">
      <div className="px-6 py-4.5 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-neutral-50/40 dark:bg-zinc-855/40">
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-zinc-400 flex items-center gap-2 font-sans">
          <Layers size={12} className="text-emerald-700 dark:text-emerald-400" /> Input & AI Generation
        </h3>
        <select 
          value={modelName} 
          onChange={e => setModelName(e.target.value)}
          className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-850 text-gray-600 dark:text-zinc-350 outline-none hover:border-gray-300 dark:hover:border-zinc-600 transition-colors cursor-pointer"
        >
          <option value="gemini-2.0-flash" className="bg-white dark:bg-zinc-900 text-gray-800 dark:text-zinc-200">Gemini 2.0 Flash (Free — 1500/day, 15 RPM) ✓ Default</option>
          <option value="gemini-2.5-flash" className="bg-white dark:bg-zinc-900 text-gray-800 dark:text-zinc-200">Gemini 2.5 Flash (Free — ⚠️ 20/day only!)</option>
          <option value="gemini-2.5-pro" className="bg-white dark:bg-zinc-900 text-gray-800 dark:text-zinc-200">Gemini 2.5 Pro (Paid — ⚠️ 5/day free)</option>
        </select>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        {/* Per-mode input format hint */}
        {activeHint && (
          <pre className="mb-3 px-3 py-2 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl text-[10px] text-amber-700 dark:text-amber-400 font-mono leading-relaxed whitespace-pre-wrap break-words">
            {activeHint}
          </pre>
        )}

        <textarea
          className="w-full flex-1 min-h-[250px] p-4 text-xs font-mono border border-gray-250/70 dark:border-zinc-700 rounded-xl bg-neutral-50/50 dark:bg-zinc-850/50 text-gray-800 dark:text-zinc-100 outline-none focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 resize-none mb-4 transition-colors placeholder-gray-400 dark:placeholder-zinc-650"
          placeholder="Paste your raw exam questions, worksheets, PDF or photo extracts here..."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          disabled={isProcessing}
        />

        {/* Mode Selector Panel */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setIsBatchMode(true)}
            disabled={isProcessing}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${isBatchMode ? 'bg-emerald-600/5 border-emerald-600/30 text-emerald-700 dark:bg-emerald-500/5 dark:border-emerald-500/30 dark:text-emerald-400 font-semibold' : 'bg-neutral-50 dark:bg-zinc-850/40 border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400'}`}
          >
            <span className="text-[10px] uppercase tracking-wider">Batch Mode</span>
            <span className="text-[9px] mt-0.5 opacity-80 font-sans font-normal">সব প্রশ্ন একবারে (নিরাপদ ও দ্রুত)</span>
          </button>
          <button
            type="button"
            onClick={() => setIsBatchMode(false)}
            disabled={isProcessing}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${!isBatchMode ? 'bg-emerald-600/5 border-emerald-600/30 text-emerald-700 dark:bg-emerald-500/5 dark:border-emerald-500/30 dark:text-emerald-400 font-semibold' : 'bg-neutral-50 dark:bg-zinc-850/40 border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400'}`}
          >
            <span className="text-[10px] uppercase tracking-wider">Sequential Mode</span>
            <span className="text-[9px] mt-0.5 opacity-80 font-sans font-normal">একটি করে লুপে (ধীর)</span>
          </button>
        </div>

        {/* Dynamic Question Detection Displays - Fully Responsive and Visible on Screen */}
        <div className="mb-4 bg-neutral-50/70 dark:bg-zinc-850/40 border border-gray-150 dark:border-zinc-800/85 rounded-xl p-4 space-y-3 shadow-none transition-colors">
          <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-zinc-400 font-sans">
            <span className="flex items-center gap-1.5">
              <ClipboardCheck size={12} className="text-emerald-700 dark:text-emerald-400" /> Question Detection Metrics
            </span>
            <span className="text-gray-400 dark:text-zinc-550">Live Diagnostics</span>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-2 text-center">
            <div className="bg-white dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/60 p-2.5 rounded-lg transition-colors">
              <span className="block text-[8px] uppercase text-gray-400 dark:text-zinc-500 font-bold tracking-wide font-sans">Live Identified</span>
              <span className="font-mono text-base font-bold text-gray-800 dark:text-zinc-100">{liveDetectedCount} block{liveDetectedCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/60 p-2.5 rounded-lg transition-colors">
              <span className="block text-[8px] uppercase text-gray-400 dark:text-zinc-500 font-bold tracking-wide font-sans">Processed AI Items</span>
              <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                {parsedData ? totalQuestionsResolved : 0} / {detectedCount !== null ? detectedCount : '0'}
              </span>
            </div>
          </div>

          {/* Detailed Detection Screen Status */}
          {isProcessing ? (
            <div className="space-y-2 bg-emerald-600/5 dark:bg-emerald-500/5 p-3 rounded-lg border border-emerald-600/10 dark:border-emerald-400/15">
              <div className="flex justify-between text-[11px] text-gray-500 dark:text-zinc-400 font-sans">
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={11} className="animate-spin text-emerald-700 dark:text-emerald-400" />
                  {isBatchMode 
                    ? 'Processing all questions at once (Rate-limit safe)...' 
                    : `Processing unit ${currentBlockIndex} of ${detectedCount || liveDetectedCount}...`}
                </span>
                <span className="font-mono font-bold">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-emerald-600 dark:bg-emerald-500 h-1.5 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          ) : parsedData ? (
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/40 p-3 border border-emerald-100/60 dark:border-emerald-900/40 rounded-lg">
              <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium font-sans">Success: {detectedCount} units parsed, and {totalQuestionsResolved} fully compiled and saved.</span>
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 dark:text-zinc-500 italic text-center py-1 bg-white dark:bg-zinc-900 border border-dashed border-gray-200 dark:border-zinc-800 rounded-lg font-sans">
              {rawText.trim() ? '✨ Read successfully. Ready for AI processing.' : '✍️ Write or paste questions above to initiate scan diagnostics.'}
            </div>
          )}

          <div className="text-[9px] text-gray-400 dark:text-zinc-500 font-mono text-center pt-1 flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {customKeys.length > 0 
              ? `Failover key queue armed (${customKeys.length} available)` 
              : 'Default high-token server-generic API credentials active'}
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs border border-[#E5E7EB] dark:border-red-900/40 rounded-xl flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <div>{errorMsg}</div>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isProcessing || !rawText.trim()}
          className="w-full py-3.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-white text-[11px] uppercase tracking-widest font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed mb-2 shadow-[0_2px_10px_rgba(0,0,0,0.03)] cursor-pointer border-none"
        >
          {isProcessing ? '⚙️ Processing text blocks...' : '✨ Parse & Generate with Gemini AI'}
        </button>

        {parsedData && (
          <div className="mt-6 border-t border-gray-100 dark:border-zinc-800 pt-6 space-y-4">
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-zinc-500 font-sans">✅ Export Options</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button 
                onClick={handleDownloadSingleHtml} 
                className="flex items-center justify-center gap-1.5 px-4 py-3 bg-emerald-600/5 dark:bg-emerald-500/5 hover:bg-emerald-600/10 dark:hover:bg-emerald-500/10 border border-emerald-600/20 dark:border-emerald-400/20 text-emerald-700 dark:text-emerald-400 text-[10px] uppercase tracking-wider font-bold rounded-xl transition-colors cursor-pointer border-none"
                title="Single standalone HTML file that opens offline anywhere"
              >
                <FileCode size={13} /> Single HTML App
              </button>
              
              <button 
                onClick={handleDownloadZip} 
                className="flex items-center justify-center gap-1.5 px-4 py-3 bg-neutral-50 dark:bg-zinc-850 hover:bg-neutral-100 dark:hover:bg-zinc-800 border border-gray-200 dark:border-zinc-750 text-gray-700 dark:text-zinc-200 text-[10px] uppercase tracking-wider font-bold rounded-xl transition-colors cursor-pointer border-none"
                title="Download full project folder ZIP with HTML, CSS, script JS files"
              >
                <Archive size={13} /> Project ZIP
              </button>
              
              <button 
                onClick={handleDownloadJson} 
                className="flex items-center justify-center gap-1.5 px-4 py-3 bg-neutral-50 dark:bg-zinc-850 hover:bg-neutral-100 dark:hover:bg-zinc-800 border border-gray-200 dark:border-zinc-750 text-gray-700 dark:text-zinc-200 text-[10px] uppercase tracking-wider font-bold rounded-xl transition-colors cursor-pointer border-none"
                title="Download raw JSON structured database text"
              >
                <Layers size={13} /> JSON Only
              </button>
            </div>

            <div className="bg-neutral-50 dark:bg-zinc-950 border border-gray-150 dark:border-zinc-800 rounded-xl p-3.5 max-h-[140px] overflow-y-auto transition-colors">
              <pre className="text-[10px] text-gray-500 dark:text-zinc-400 font-mono leading-relaxed">
                {JSON.stringify(parsedData, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
