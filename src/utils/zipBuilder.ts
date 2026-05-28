import JSZip from 'jszip';
import { QuizType, QuizConfig } from '../types';

export function getSingleHtmlTemplate(quizType: QuizType, config: QuizConfig, data: any) {
  const title = config.title || `${quizType} Quiz`;
  const subtitle = config.subtitle || "Complete all sections within the timer.";
  const totalTime = config.totalTime || 480;
  const marksCorrect = config.marksCorrect || 2.0;
  const marksWrong = config.marksWrong || 0.0;
  const maxQuestions = config.maxQuestions || 0;
  const gsUrl = config.gsUrl || '';
  const defaultLang = config.defaultLang || 'en';

  let rawQuestions = Array.isArray(data) ? data : (data.questions || []);
  if (maxQuestions > 0) {
    rawQuestions = rawQuestions.slice(0, maxQuestions);
  }
  const passage = quizType === 'Passage' || quizType === 'Cloze' ? (data.passage || "") : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Georgia:ital@0;1&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .serif {
      font-family: 'Georgia', serif;
    }
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 99px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.15);
    }
  </style>
</head>
<body class="bg-[#121214] text-zinc-100 min-h-screen">
  <!-- Tailwind CDN Safelist for dynamic classes -->
  <div class="hidden bg-[#111113] text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 hover:bg-zinc-900 bg-emerald-600 text-white border-emerald-700 bg-red-800 border-red-900 bg-orange-600 border-orange-700 bg-emerald-500 border-emerald-600 ring-2 ring-offset-2 ring-offset-[#121214] ring-emerald-500 font-extrabold scale-110 bg-teal-900/30 border-teal-700/60 text-teal-300 font-semibold bg-[#18181b]/60 hover:bg-[#27272a] text-zinc-300 text-emerald-400 text-zinc-500 bg-emerald-500/10 border-emerald-500/20 bg-zinc-800 border-zinc-700/30 bg-red-500/10 text-red-400 border-red-500/20 bg-red-300 bg-[#111113]/70"></div>
  <div id="app" class="flex flex-col min-h-screen">
    <!-- Screen 1: Start/Name Input Screen -->
    <div id="screen-start" class="flex-1 flex items-center justify-center p-6 bg-[#121214]">
      <div class="max-w-md w-full bg-[#1c1c1f] border border-zinc-800/80 p-8 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] space-y-6 text-center">
        <div class="space-y-2">
          <span class="text-[10px] uppercase font-bold tracking-[0.25em] text-emerald-400">Assessment Entry</span>
          <h1 class="serif text-3xl font-medium tracking-tight text-white">${title}</h1>
          <p class="text-xs text-zinc-400 leading-relaxed">${subtitle}</p>
        </div>

        <div class="border-t border-b border-zinc-800 py-4 text-left grid grid-cols-2 gap-4 text-xs text-zinc-400">
          <div>⏳ Time limit: <span class="font-bold text-zinc-200">${Math.floor(totalTime / 60)}m ${totalTime % 60}s</span></div>
          <div>📝 Total Qs: <span class="font-bold text-zinc-200">${rawQuestions.length}</span></div>
          <div>✅ Right answer: <span class="font-bold text-emerald-400">+${marksCorrect} marks</span></div>
          <div>❌ Penalty: <span class="font-bold text-red-400">${marksWrong} marks</span></div>
        </div>

        <div class="text-left space-y-2">
          <label class="block text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Attendee Name</label>
          <input 
            type="text" 
            id="attendee-name" 
            placeholder="Introduce yourself to start..." 
            class="w-full text-sm px-4 py-3 border border-zinc-800 rounded-xl bg-zinc-900/50 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all placeholder-zinc-600"
          />
        </div>

        <button onclick="startQuiz()" class="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] uppercase tracking-widest font-bold rounded-xl transition-all shadow-md border-none cursor-pointer">
          Begin Assessment
        </button>
      </div>
    </div>

    <!-- Screen 2: Active Quiz Area -->
    <div id="screen-quiz" class="hidden flex-1 flex flex-col bg-[#121214] text-zinc-100">
      <header class="bg-[#1c1c1f] border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-lg">
        <div>
          <h2 class="serif text-lg font-medium text-white">${title}</h2>
          <span id="player-badge" class="text-[9px] uppercase tracking-wider text-zinc-400 font-bold">Guest Attendee</span>
        </div>
        
        <div class="flex items-center gap-4">
          <!-- Language Toggle button for Bilingual layouts (GK, Math, Reasoning) -->
          <div id="language-controller" class="hidden flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button onclick="toggleLanguage('en')" id="lang-en" class="px-2.5 py-1 text-[10px] font-bold uppercase rounded transition-colors bg-zinc-800 text-white cursor-pointer border-none shadow-sm">EN</button>
            <button onclick="toggleLanguage('bn')" id="lang-bn" class="px-2.5 py-1 text-[10px] font-bold uppercase rounded transition-colors text-zinc-400 cursor-pointer border-none">বাংলা</button>
          </div>

          <div id="timer-box" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-950/40 border border-red-900/50 text-red-400 font-mono text-xs font-bold leading-none animate-pulse">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
            <span id="timer-text">00:00</span>
          </div>
        </div>
      </header>

      <!-- Main Columns Grid -->
      <div id="layout-grid" class="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <!-- Optional Left Column for Passage/Cloze Text -->
        <div id="passage-container" class="hidden md:col-span-4 bg-[#1c1c1f] border border-zinc-800 p-6 rounded-2xl shadow-lg overflow-y-auto max-h-[300px] md:max-h-[calc(100vh-160px)]">
          <span class="text-[9px] uppercase tracking-widest text-emerald-400 font-bold block mb-2">Comprehension Text</span>
          <p id="passage-text-view" class="serif text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap text-justify"></p>
        </div>

        <!-- Question Render Box (Spans 8 or 5 of 12 depending on passage container presence, handles transitions) -->
        <div id="question-column" class="md:col-span-8 space-y-6 flex flex-col justify-between">
          <div class="bg-[#1c1c1f] border border-zinc-800 p-6 md:p-8 rounded-2xl shadow-lg space-y-6">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span id="q-number-indicator" class="text-[10px] uppercase font-bold tracking-widest text-emerald-400">Question 0 of 0</span>
              <span class="text-[9px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 border border-zinc-800 rounded tracking-wide">Multi-Choice (MCQ)</span>
            </div>

            <!-- Cloze Test help text -->
            <div id="cloze-help" class="hidden text-xs text-zinc-400 bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-lg">
              🎯 Select correct option to fill blank position <b id="cloze-blank-num"></b> in left-hand passage.
            </div>

            <p id="q-text-view" class="text-base text-white font-medium leading-relaxed whitespace-pre-wrap"></p>
            
            <!-- Optional sentences block for Parajumble -->
            <div id="sentences-box" class="hidden space-y-2 bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-xs text-zinc-300"></div>

            <div id="options-view" class="grid grid-cols-1 gap-3 pt-2">
              <!-- Options injected here dynamically -->
            </div>
          </div>

          <!-- Bottom Navigation Controls -->
          <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
            <button onclick="prevQuestion()" id="btn-prev" class="px-4 py-2 border-none bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs uppercase tracking-widest font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-center cursor-pointer">
              Previous
            </button>
            <div class="flex flex-wrap gap-2">
              <button onclick="nextQuestion()" id="btn-next" class="px-4 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-900 text-xs uppercase tracking-widest font-bold rounded-xl transition-colors cursor-pointer border-none text-center">
                Next
              </button>
              <button onclick="nextAndReview()" id="btn-review" class="px-4 py-2.5 bg-violet-900/40 hover:bg-violet-800/50 text-violet-300 border border-violet-700/50 text-xs uppercase tracking-widest font-bold rounded-xl transition-colors cursor-pointer shadow-sm text-center">
                Next & Preview
              </button>
              <button onclick="saveAndNext()" id="btn-save" class="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs uppercase tracking-widest font-bold rounded-xl transition-colors cursor-pointer border-none shadow-md text-center">
                Next & Save
              </button>
            </div>
          </div>
        </div>

        <!-- Right Side Questionnaire circles Grid (Desktop only) -->
        <div id="desktop-palette" class="hidden md:block md:col-span-4 bg-[#1c1c1f] border border-zinc-800 p-5 rounded-2xl shadow-lg h-match max-h-[calc(100vh-160px)] overflow-y-auto sticky top-24 space-y-5">
          <h3 class="text-[10px] uppercase tracking-widest font-bold text-zinc-400 border-b border-zinc-800 pb-2">
            🧭 Question Palette
          </h3>
          <div id="desktop-circle-grid" class="grid grid-cols-5 gap-2.5 pb-4 border-b border-zinc-800">
            <!-- Populated circles dynamically -->
          </div>
          <div class="space-y-2 text-[10px] text-zinc-400 pb-2">
            <span class="block font-bold uppercase tracking-wider text-zinc-500">Legend</span>
            <div class="grid grid-cols-2 gap-2">
              <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-teal-600"></span><span>Saved</span></div>
              <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-red-700"></span><span>Skipped</span></div>
              <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-orange-600"></span><span>Review</span></div>
              <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-violet-600"></span><span>Ans & Rev</span></div>
              <div class="flex items-center gap-1.5 col-span-2"><span class="w-3 h-3 rounded-full bg-zinc-900 border border-zinc-700 animate-pulse"></span><span>Unvisited</span></div>
            </div>
          </div>
          <div class="pt-4 border-t border-zinc-800">
            <button onclick="commitFinalSubmitDirectly()" class="w-full py-2.5 bg-red-800 hover:bg-red-900 border-none text-white text-xs uppercase tracking-widest font-bold rounded-xl transition-all cursor-pointer text-center shadow-md">
              Submit Exam
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Screen 3: Submission & Detailed Answers View -->
    <div id="screen-result" class="hidden flex-1 flex flex-col items-center justify-start p-6 max-w-3xl mx-auto w-full py-12 bg-[#121214] text-zinc-100">
      <div id="results-card" class="w-full bg-[#1c1c1f] border border-zinc-800/80 p-8 rounded-3xl text-center space-y-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)] mb-8">
        <div class="space-y-1.5">
          <span class="text-[10px] uppercase font-bold tracking-[0.25em] text-emerald-400">Performance Summary</span>
          <h1 class="serif text-3xl font-medium tracking-tight text-white">Quiz Handed In Successfully</h1>
          <p id="result-attendee" class="text-xs text-zinc-400 font-medium"></p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div class="text-center p-2">
            <span class="block text-[9px] uppercase text-zinc-500 font-semibold tracking-wide">Final Score</span>
            <span id="final-score" class="serif text-2xl font-bold block mt-1 text-white">0.0</span>
          </div>
          <div class="text-center p-2 border-l border-zinc-800">
            <span class="block text-[9px] uppercase text-zinc-500 font-semibold tracking-wide">Accuracy</span>
            <span id="accuracy-stat" class="serif text-2xl font-bold text-zinc-300 block mt-1">0%</span>
          </div>
          <div class="text-center p-2 border-l border-zinc-800">
            <span class="block text-[9px] uppercase text-zinc-500 font-semibold tracking-wide">Right / Wrong</span>
            <span id="correct-wrong-ratio" class="font-mono text-xs block mt-2 text-zinc-300">0 / 0</span>
          </div>
          <div class="text-center p-2 border-l border-zinc-800">
            <span class="block text-[9px] uppercase text-zinc-500 font-semibold tracking-wide">Time Elapsed</span>
            <span id="time-saved-stat" class="serif text-2xl font-bold text-emerald-400 block mt-1">0s</span>
          </div>
        </div>

        <button onclick="window.location.reload()" class="px-6 py-2.5 bg-emerald-600 border-none hover:bg-emerald-700 text-white text-[10px] uppercase tracking-widest font-bold rounded-xl transition-all cursor-pointer shadow-md">
          Retake Assessment
        </button>

        <!-- Sheets Synced Loader -->
        <div id="sheets-sync-status" class="hidden text-[11px] font-medium text-zinc-400 border-t border-zinc-800 pt-4 flex items-center justify-center gap-1.5">
          <svg class="animate-spin h-3.5 w-3.5 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <span id="sync-msg">Establishing connection with central Google Sheets ledger...</span>
        </div>
      </div>

      <!-- Part 4: THE USER REQUESTED DETAILED ANALYSIS PORTION -->
      <div class="w-full space-y-4 text-left">
        <h3 class="serif text-xl italic text-white border-b border-zinc-800 pb-2 flex items-center justify-between">
          <span>Detailed Explanations & Review</span>
          <span class="text-[10px] uppercase font-sans tracking-widest font-bold text-zinc-500">Annotated Analysis</span>
        </h3>
        
        <div id="review-language-controller" class="hidden flex justify-end gap-2 items-center my-3 select-none bg-zinc-900/30 p-2 rounded-xl border border-zinc-800/40">
          <span class="text-xs text-zinc-400 font-medium mr-1 font-sans">Review Language:</span>
          <button id="btn-review-lang-en" onclick="setReviewLanguage('en')" class="px-3 py-1.5 text-[10px] font-bold uppercase rounded cursor-pointer border-none transition-colors">English</button>
          <button id="btn-review-lang-bn" onclick="setReviewLanguage('bn')" class="px-3 py-1.5 text-[10px] font-bold uppercase rounded cursor-pointer border-none transition-colors">বাংলা</button>
        </div>

        <div id="detailed-answers-review-list" class="space-y-6">
          <!-- Dynamically populated answer review rows -->
        </div>
      </div>
    </div>
  </div>

  <!-- Mobile Drag/Handle indicator on right edge -->
  <button id="mobile-pull-handle" onclick="openMobileDrawer()" class="md:hidden fixed right-0 top-1/2 -translate-y-1/2 bg-[#ea580c] text-white py-4 px-1.5 rounded-l-xl shadow-lg border-none flex flex-col items-center gap-1 z-30 opacity-80 hover:opacity-100 transition-opacity cursor-pointer">
    <span class="text-[8px] uppercase tracking-widest font-black [writing-mode:vertical-lr] text-center rotate-180 mb-0.5">palette</span>
    <span class="text-xs">◀</span>
  </button>

  <!-- Mobile Drawer side sheet -->
  <div id="mobile-drawer" class="fixed inset-y-0 right-0 z-50 w-72 bg-[#1c1c1f] shadow-2xl transform translate-x-full transition-transform duration-300 ease-in-out border-l border-zinc-800 flex flex-col md:hidden text-zinc-100">
    <div class="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
      <h3 class="text-[10px] uppercase tracking-widest font-bold text-zinc-400">🧭 Questions list</h3>
      <button onclick="closeMobileDrawer()" class="p-1 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-none font-bold text-xs rounded-lg cursor-pointer">✕ Close</button>
    </div>
    <div id="mobile-circle-grid" class="flex-1 p-5 grid grid-cols-5 gap-2.5 content-start overflow-y-auto bg-[#18181a]">
      <!-- Mobile circles -->
    </div>
    <div class="p-4 bg-zinc-950 border-t border-zinc-800 text-[10px] text-zinc-400 space-y-2">
      <span class="block font-bold tracking-wider uppercase text-zinc-500">Legend</span>
      <div class="grid grid-cols-2 gap-2">
        <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-teal-600"></span><span>Saved</span></div>
        <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-red-700"></span><span>Skipped</span></div>
        <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-orange-600"></span><span>Review</span></div>
        <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-violet-600"></span><span>Ans & Rev</span></div>
      </div>
    </div>
    <div class="p-4 bg-zinc-950 border-t border-zinc-800">
      <button onclick="commitFinalSubmitDirectly()" class="w-full py-3 bg-red-800 hover:bg-red-900 border-none text-white text-[11px] uppercase tracking-widest font-bold rounded-xl transition-all cursor-pointer shadow-md">
        Submit Exam
      </button>
    </div>
  </div>
  
  <!-- Mobile Backdrop -->
  <div id="mobile-drawer-backdrop" onclick="closeMobileDrawer()" class="fixed inset-0 bg-black/60 z-40 opacity-0 pointer-events-none transition-opacity duration-300 ease-in-out md:hidden text-white"></div>

  <!-- Stylish Submit Confirmation Modal -->
  <div id="submit-confirm-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 opacity-0 pointer-events-none transition-opacity duration-300 ease-in-out">
    <!-- Backdrop overlay -->
    <div onclick="closeSubmitConfirmModal()" class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
    
    <!-- Modal Dialog Content -->
    <div class="relative max-w-sm w-full bg-[#1c1c1f] border border-zinc-800 p-6 rounded-2xl shadow-2xl text-center space-y-5 transform scale-95 transition-transform duration-300 ease-in-out" id="submit-confirm-modal-box">
      <!-- Info Icon -->
      <div class="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mb-2">
        <span class="text-xl font-bold">⚠️</span>
      </div>
      <div class="space-y-1">
        <h3 class="serif text-lg font-medium text-white">Submit Your Assessment?</h3>
        <p class="text-xs text-zinc-400">Are you sure you want to finalize and submit? You won't be able to change your answers once submitted.</p>
      </div>
      
      <!-- Stats Summary inside confirmation modal -->
      <div id="confirm-stats-summary" class="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-center">
        <div>
          <span class="block text-[8px] uppercase text-zinc-500 font-bold tracking-wider">Answered</span>
          <span id="confirm-answered-qty" class="text-xs font-semibold text-emerald-400">0</span>
        </div>
        <div>
          <span class="block text-[8px] uppercase text-zinc-500 font-bold tracking-wider">Review</span>
          <span id="confirm-review-qty" class="text-xs font-semibold text-emerald-400">0</span>
        </div>
        <div>
          <span class="block text-[8px] uppercase text-zinc-500 font-bold tracking-wider">Unvisited</span>
          <span id="confirm-unvisited-qty" class="text-xs font-semibold text-zinc-500">0</span>
        </div>
      </div>
      
      <!-- Modal Trigger Actions -->
      <div class="grid grid-cols-2 gap-3 pt-2">
        <button onclick="closeSubmitConfirmModal()" class="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 hover:text-white border-zinc-700 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer border-none text-center">
          Cancel
        </button>
        <button onclick="confirmSubmitQuiz()" class="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-zinc-950 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer border-none text-center shadow-md">
          Yes, Submit
        </button>
      </div>
    </div>
  </div>

  <script>
    // Embedded parsed questions structures
    const QUESTIONS_DATA = ${JSON.stringify(rawQuestions)};
    const PASSAGE_DATA = ${JSON.stringify(passage)};
    const QUIZ_TYPE = "${quizType}";
    const MARKS_CORRECT = ${marksCorrect};
    const MARKS_WRONG = ${marksWrong};
    const TIME_LIMIT = ${totalTime};
    const GS_URL = "${gsUrl}";
    const PRE_LANG = "${defaultLang}";

    let attendeeName = "";
    let currentIdx = 0;
    let selectedLanguage = PRE_LANG;
    let timeLeft = TIME_LIMIT;
    let timerInterval = null;
    let answers = {}; // idx -> selected Index
    let questionStates = Array(QUESTIONS_DATA.length).fill('unvisited'); 
    let timestampStarted = null;

    const isBilingual = QUIZ_TYPE === "GK" || QUIZ_TYPE === "Math" || QUIZ_TYPE === "Reasoning";
    const STORAGE_KEY_PREFIX = 'stand_alone_quiz_' + btoa("${title}").replace(/=/g, '');
    const LAST_NAME_KEY = 'stand_alone_quiz_last_name_' + btoa("${title}").replace(/=/g, '');

    function getStorageKey(name) {
      return STORAGE_KEY_PREFIX + '_' + btoa(name.toLowerCase().trim()).replace(/=/g, '');
    }

    function saveStateToLocalStorage() {
      if (!attendeeName) return;
      try {
        const key = getStorageKey(attendeeName);
        const stateObj = {
          attendeeName,
          currentIdx,
          selectedLanguage,
          answers,
          questionStates,
          timeLeft,
          started: true
        };
        localStorage.setItem(key, JSON.stringify(stateObj));
      } catch (err) {
        console.error("Failed to save state", err);
      }
    }

    function loadSavedState() {
      try {
        const lastName = localStorage.getItem(LAST_NAME_KEY);
        if (lastName) {
          const nameInputEl = document.getElementById('attendee-name');
          if (nameInputEl) nameInputEl.value = lastName;

          // Auto-resume if there is an active session in progress for this student
          const key = getStorageKey(lastName);
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.started) {
              attendeeName = parsed.attendeeName || lastName;
              currentIdx = parsed.currentIdx || 0;
              selectedLanguage = parsed.selectedLanguage || PRE_LANG;
              answers = parsed.answers || {};
              questionStates = parsed.questionStates || Array(QUESTIONS_DATA.length).fill('unvisited');
              timeLeft = parsed.timeLeft !== undefined ? parsed.timeLeft : TIME_LIMIT;
              resumeQuiz();
            }
          }
        }
      } catch (err) {
        console.error("Failed to restore state on load", err);
      }
    }

    function startQuiz() {
      const nameInput = document.getElementById('attendee-name').value.trim();
      if (!nameInput) {
        alert("Please enter your name to proceed.");
        return;
      }
      attendeeName = nameInput;
      
      try {
        localStorage.setItem(LAST_NAME_KEY, nameInput);
      } catch(e) {}

      const key = getStorageKey(attendeeName);
      let loadedSession = false;
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.started) {
            currentIdx = parsed.currentIdx || 0;
            selectedLanguage = parsed.selectedLanguage || PRE_LANG;
            answers = parsed.answers || {};
            questionStates = parsed.questionStates || Array(QUESTIONS_DATA.length).fill('unvisited');
            timeLeft = parsed.timeLeft !== undefined ? parsed.timeLeft : TIME_LIMIT;
            loadedSession = true;
          }
        }
      } catch (err) {
        console.error("Failed to restore state", err);
      }

      if (!loadedSession) {
        currentIdx = 0;
        selectedLanguage = PRE_LANG;
        answers = {};
        questionStates = Array(QUESTIONS_DATA.length).fill('unvisited');
        timeLeft = TIME_LIMIT;
        saveStateToLocalStorage();
      }

      resumeQuiz();
    }

    function resumeQuiz() {
      document.getElementById('screen-start').classList.add('hidden');
      document.getElementById('screen-quiz').classList.remove('hidden');
      document.getElementById('player-badge').innerText = "Attendee: " + attendeeName + " (" + selectedLanguage.toUpperCase() + ")";

      if (isBilingual) {
        document.getElementById('language-controller').classList.remove('hidden');
        toggleLanguage(selectedLanguage);
      }

      // Configure Passage view columns
      const hasPassage = QUIZ_TYPE === 'Passage' || QUIZ_TYPE === 'Cloze';
      if (hasPassage) {
        document.getElementById('passage-container').classList.remove('hidden');
        document.getElementById('passage-text-view').innerText = PASSAGE_DATA;
        
        // Adjust column layouts for desktop grid
        const grid = document.getElementById('layout-grid');
        grid.className = "flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 p-4 md:p-6 max-w-7xl mx-auto w-full";
        
        document.getElementById('passage-container').className = "md:col-span-4 bg-[#1c1c1f] border border-zinc-800 p-6 rounded-2xl shadow-lg overflow-y-auto max-h-[300px] md:max-h-[calc(100vh-160px)] text-zinc-100";
        document.getElementById('question-column').className = "md:col-span-5 space-y-6 flex flex-col justify-between";
        document.getElementById('desktop-palette').className = "hidden md:block md:col-span-3 bg-[#1c1c1f] border border-zinc-800 p-5 rounded-2xl shadow-xl h-match max-h-[calc(100vh-160px)] overflow-y-auto sticky top-24 space-y-6 text-zinc-100";
      } else {
        const grid = document.getElementById('layout-grid');
        grid.className = "flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 p-4 md:p-6 max-w-7xl mx-auto w-full";
        
        document.getElementById('question-column').className = "md:col-span-9 space-y-6 flex flex-col justify-between";
        document.getElementById('desktop-palette').className = "hidden md:block md:col-span-3 bg-[#1c1c1f] border border-zinc-800 p-5 rounded-2xl shadow-xl h-match max-h-[calc(100vh-160px)] overflow-y-auto sticky top-24 space-y-6 text-zinc-100";
      }

      if (QUIZ_TYPE === 'Cloze') {
        document.getElementById('cloze-help').classList.remove('hidden');
      }

      renderCurrentQuestion();
      renderCircleGrids();

      // Start timer countdown using timeLeft
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        document.getElementById('timer-text').innerText = (mins < 10 ? '0' + mins : mins) + ":" + (secs < 10 ? '0' + secs : secs);
        
        // Save state at every second tick
        saveStateToLocalStorage();

        if (timeLeft <= 0) {
          clearInterval(timerInterval);
          submitQuiz(true, true); // true (expires), true (bypass confirm)
        }
      }, 1000);

      initTouchListeners();
    }

    function toggleLanguage(lang) {
      selectedLanguage = lang;
      const enBtn = document.getElementById('lang-en');
      const bnBtn = document.getElementById('lang-bn');

      if (lang === 'bn') {
        bnBtn.className = "px-2.5 py-1 text-[10px] font-bold uppercase rounded bg-neutral-900 text-white shadow-sm";
        enBtn.className = "px-2.5 py-1 text-[10px] font-bold uppercase rounded text-gray-400";
      } else {
        enBtn.className = "px-2.5 py-1 text-[10px] font-bold uppercase rounded bg-neutral-900 text-white shadow-sm";
        bnBtn.className = "px-2.5 py-1 text-[10px] font-bold uppercase rounded text-gray-400";
      }

      document.getElementById('player-badge').innerText = "Attendee: " + attendeeName + " (" + selectedLanguage.toUpperCase() + ")";
      renderCurrentQuestion();
    }

    function renderCurrentQuestion() {
      if (QUESTIONS_DATA.length === 0) return;
      const q = QUESTIONS_DATA[currentIdx];

      document.getElementById('q-number-indicator').innerText = "Question " + (currentIdx + 1) + " of " + QUESTIONS_DATA.length;

      if (QUIZ_TYPE === 'Cloze' && q.blank_num) {
        document.getElementById('cloze-blank-num').innerText = q.blank_num;
      }

      let text = "";
      let options = [];

      if (selectedLanguage === 'bn') {
        text = q.question_bn || q.question_en || q.question || "";
        options = q.options_bn || q.options_en || q.options || [];
      } else {
        text = q.question_en || q.question || "";
        options = q.options_en || q.options || [];
      }

      document.getElementById('q-text-view').innerText = text;

      const sentenceBox = document.getElementById('sentences-box');
      if (QUIZ_TYPE === 'Parajumble' && q.sentences) {
        sentenceBox.classList.remove('hidden');
        sentenceBox.innerHTML = "";
        Object.entries(q.sentences).forEach(([key, value]) => {
          const div = document.createElement('div');
          div.className = "flex items-start gap-1 py-0.5";
          div.innerHTML = "<b class='text-emerald-400 mr-1'>" + key + ":</b> " + value;
          sentenceBox.appendChild(div);
        });
      } else {
        sentenceBox.classList.add('hidden');
      }

      const optView = document.getElementById('options-view');
      optView.innerHTML = "";
      const chosenIdx = answers[currentIdx];

      options.forEach((opt, idx) => {
        const optionBtn = document.createElement('div');
        optionBtn.onclick = () => selectOption(idx);
        const isSelected = chosenIdx === idx;
        
        optionBtn.className = "border rounded-xl px-4 py-3 text-sm font-medium cursor-pointer transition-all flex items-center justify-between " + 
          (isSelected 
            ? "bg-emerald-500/15 border-emerald-500 text-emerald-300 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.2)]" 
            : "bg-[#18181b]/60 hover:bg-[#27272a] border-zinc-800 text-zinc-300");
        
        let labelAlpha = String.fromCharCode(65 + idx);
        optionBtn.innerHTML = "<span><b class='" + (isSelected ? "text-emerald-400" : "text-zinc-500") + "'>" + labelAlpha + ".</b> " + opt + "</span>" + 
          (isSelected ? " <span class='text-[10px] uppercase font-bold text-emerald-400 tracking-wider'>Selected</span>" : "");
        
        optView.appendChild(optionBtn);
      });

      // Update submit label
      const isLast = currentIdx === QUESTIONS_DATA.length - 1;
      const nextBtn = document.getElementById('btn-next');
      if (isLast) {
        nextBtn.innerText = "Submit";
      } else {
        nextBtn.innerText = "Next";
      }

      document.getElementById('btn-prev').disabled = currentIdx === 0;
    }

    function selectOption(idx) {
      if (answers[currentIdx] === idx) {
        answers[currentIdx] = undefined;
        if (questionStates[currentIdx] === 'saved' || questionStates[currentIdx] === 'answered_not_saved' || questionStates[currentIdx] === 'review_answered') {
           questionStates[currentIdx] = 'unvisited'; 
        }
      } else {
        answers[currentIdx] = idx;
        if (questionStates[currentIdx] !== 'review_answered' && questionStates[currentIdx] !== 'review_unanswered' && questionStates[currentIdx] !== 'saved') {
          questionStates[currentIdx] = 'answered_not_saved';
        }
      }
      renderCurrentQuestion();
      renderCircleGrids();
      saveStateToLocalStorage();
    }

    function transitionState(fromIdx, action) {
      const chosen = answers[fromIdx];
      const oldState = questionStates[fromIdx];

      if (action === 'saveAndNext') {
        if (chosen !== undefined) {
          questionStates[fromIdx] = 'saved';
        } else {
          questionStates[fromIdx] = 'skipped';
        }
      } else if (action === 'nextAndReview') {
        if (chosen !== undefined) {
          questionStates[fromIdx] = 'review_answered';
        } else {
          questionStates[fromIdx] = 'review_unanswered';
        }
      } else if (action === 'navigate') {
        // Left without save/review clicked
        if (oldState !== 'saved' && oldState !== 'review_answered' && oldState !== 'review_unanswered') {
          if (chosen !== undefined) {
            questionStates[fromIdx] = 'answered_not_saved';
          } else {
            questionStates[fromIdx] = 'skipped';
          }
        }
      }
      saveStateToLocalStorage();
    }

    function renderCircleGrids() {
      const dsGrid = document.getElementById('desktop-circle-grid');
      const mbGrid = document.getElementById('mobile-circle-grid');
      
      if (dsGrid) dsGrid.innerHTML = "";
      if (mbGrid) mbGrid.innerHTML = "";

      QUESTIONS_DATA.forEach((q, idx) => {
        const isCurrent = idx === currentIdx;
        const state = questionStates[idx] || 'unvisited';
        
        // Slightly darker shade of black for unvisited questions
        let stateClasses = "bg-[#111113] text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 hover:bg-zinc-900 shadow-sm";
        if (state === 'saved') {
          stateClasses = "bg-teal-600 text-white border-teal-700";
        } else if (state === 'skipped') {
          stateClasses = "bg-red-700 text-white border-red-800";
        } else if (state === 'review_unanswered') {
          stateClasses = "bg-orange-600 text-white border-orange-700";
        } else if (state === 'review_answered' || state === 'answered_not_saved') {
          stateClasses = "bg-violet-600 text-white border-violet-700";
        }

        let ringClass = isCurrent ? "ring-2 ring-offset-2 ring-offset-[#121214] ring-emerald-500 font-extrabold scale-110 text-white" : "";
        
        const btnClasses = "w-9 h-9 rounded-full flex items-center justify-center text-xs border font-medium transition-all cursor-pointer shadow-sm select-none border-none " + stateClasses + " " + ringClass;

        if (dsGrid) {
          const btn = document.createElement('button');
          btn.className = btnClasses;
          btn.innerText = idx + 1;
          btn.onclick = () => jumpToQuestion(idx);
          dsGrid.appendChild(btn);
        }
        
        if (mbGrid) {
          const btn = document.createElement('button');
          btn.className = "w-10 h-10 rounded-full flex items-center justify-center text-sm border font-medium transition-all cursor-pointer shadow-sm select-none border-none " + stateClasses + " " + ringClass;
          btn.innerText = idx + 1;
          btn.onclick = () => {
            jumpToQuestion(idx);
            closeMobileDrawer();
          };
          mbGrid.appendChild(btn);
        }
      });
    }

    function jumpToQuestion(newIdx) {
      if (newIdx < 0 || newIdx >= QUESTIONS_DATA.length) return;
      transitionState(currentIdx, 'navigate');
      currentIdx = newIdx;
      renderCurrentQuestion();
      renderCircleGrids();
      saveStateToLocalStorage();
    }

    function prevQuestion() {
      if (currentIdx > 0) {
        jumpToQuestion(currentIdx - 1);
      }
    }

    function nextQuestion() {
      if (currentIdx < QUESTIONS_DATA.length - 1) {
        jumpToQuestion(currentIdx + 1);
      } else {
        transitionState(currentIdx, 'navigate');
        renderCircleGrids();
        submitQuiz(false);
      }
    }

    function saveAndNext() {
      transitionState(currentIdx, 'saveAndNext');
      if (currentIdx < QUESTIONS_DATA.length - 1) {
        currentIdx++;
        renderCurrentQuestion();
        renderCircleGrids();
      } else {
        renderCircleGrids();
        submitQuiz(false);
      }
    }

    function nextAndReview() {
      transitionState(currentIdx, 'nextAndReview');
      if (currentIdx < QUESTIONS_DATA.length - 1) {
        currentIdx++;
        renderCurrentQuestion();
        renderCircleGrids();
      } else {
        renderCircleGrids();
        submitQuiz(false);
      }
    }

    // Slide-out Drawer for Mobile
    function openMobileDrawer() {
      document.getElementById('mobile-drawer').classList.remove('translate-x-full');
      const backdrop = document.getElementById('mobile-drawer-backdrop');
      backdrop.classList.remove('pointer-events-none', 'opacity-0');
      backdrop.classList.add('opacity-100');
    }

    function closeMobileDrawer() {
      document.getElementById('mobile-drawer').classList.add('translate-x-full');
      const backdrop = document.getElementById('mobile-drawer-backdrop');
      backdrop.classList.remove('opacity-100');
      backdrop.classList.add('pointer-events-none', 'opacity-0');
    }

    // Touch actions initialization
    let touchStartX = 0;
    let touchStartY = 0;

    function initTouchListeners() {
      const activeArea = document.getElementById('screen-quiz');
      if (!activeArea) return;

      activeArea.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      activeArea.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Horizonal Swipe detection for navigation (left/right)
        if (Math.abs(diffX) > 70 && Math.abs(diffY) < 45) {
          if (diffX < 0) {
            nextQuestion(); // swipe left -> forward
          } else {
            prevQuestion(); // swipe right -> backward
          }
        }
        // Force Right Edge Drag detection to slide-out palette drawer
        else if (touchStartX > window.innerWidth - 60 && diffX < -60 && Math.abs(diffY) < 55) {
          openMobileDrawer();
        }
      }, { passive: true });
    }

    function openSubmitConfirmModal() {
      // Calculate active metrics
      let answered = 0;
      let review = 0;
      let unvisited = 0;
      
      QUESTIONS_DATA.forEach((_, idx) => {
        const state = questionStates[idx] || 'unvisited';
        if (state === 'saved') {
          answered++;
        } else if (state === 'review_answered') {
          answered++;
          review++;
        } else if (state === 'review_unanswered') {
          review++;
        } else if (state === 'unvisited' || state === 'skipped') {
          unvisited++;
        }
      });
      
      document.getElementById('confirm-answered-qty').innerText = answered;
      document.getElementById('confirm-review-qty').innerText = review;
      document.getElementById('confirm-unvisited-qty').innerText = unvisited;

      const modal = document.getElementById('submit-confirm-modal');
      const box = document.getElementById('submit-confirm-modal-box');
      
      modal.classList.remove('pointer-events-none', 'opacity-0');
      modal.classList.add('opacity-100');
      box.classList.remove('scale-95');
      box.classList.add('scale-100');
    }

    function closeSubmitConfirmModal() {
      const modal = document.getElementById('submit-confirm-modal');
      const box = document.getElementById('submit-confirm-modal-box');
      
      modal.classList.remove('opacity-100');
      modal.classList.add('pointer-events-none', 'opacity-0');
      box.classList.remove('scale-100');
      box.classList.add('scale-95');
    }

    function confirmSubmitQuiz() {
      closeSubmitConfirmModal();
      submitQuiz(false, true);
    }

    function commitFinalSubmitDirectly() {
      submitQuiz(false);
    }

    function submitQuiz(isFromTimeout = false, bypassConfirm = false) {
      if (timerInterval) clearInterval(timerInterval);
      
      if (!isFromTimeout && !bypassConfirm) {
        openSubmitConfirmModal();
        return;
      }

      if (isFromTimeout) {
        alert("Time limit reached. Compiling responses.");
      }

      let scoreObtained = 0.0;
      let correctCount = 0;
      let wrongCount = 0;
      let skippedCount = 0;

      QUESTIONS_DATA.forEach((questionItem, idx) => {
        const chosen = answers[idx];
        if (chosen === undefined) {
          skippedCount++;
        } else if (chosen === questionItem.correctIndex) {
          correctCount++;
          scoreObtained += MARKS_CORRECT;
        } else {
          wrongCount++;
          scoreObtained += MARKS_WRONG;
        }
      });

      const maxScore = QUESTIONS_DATA.length * MARKS_CORRECT;
      const accuracy = QUESTIONS_DATA.length > 0 ? Math.round((correctCount / QUESTIONS_DATA.length) * 100) : 0;
      const timeSpent = TIME_LIMIT - timeLeft;

      document.getElementById('screen-quiz').classList.add('hidden');
      document.getElementById('mobile-pull-handle').classList.add('hidden');
      document.getElementById('screen-result').classList.remove('hidden');

      // Hydrate scores
      document.getElementById('result-attendee').innerText = "Record generated for " + attendeeName + " · " + new Date().toLocaleDateString();
      document.getElementById('final-score').innerText = scoreObtained.toFixed(1) + " / " + maxScore.toFixed(1);
      document.getElementById('accuracy-stat').innerText = accuracy + "%";
      document.getElementById('correct-wrong-ratio').innerText = correctCount + " Correct / " + wrongCount + " Wrong / " + skippedCount + " Skipped";
      
      const elMins = Math.floor(timeSpent / 60);
      const elSecs = timeSpent % 60;
      document.getElementById('time-saved-stat').innerText = elMins + "m " + elSecs + "s";

      if (isBilingual) {
        document.getElementById('review-language-controller').classList.remove('hidden');
        setReviewLanguage(selectedLanguage);
      } else {
        document.getElementById('review-language-controller').classList.add('hidden');
        renderDetailedReview();
      }
      
      // Erase data for this user from localStorage 
      try {
        const key = getStorageKey(attendeeName);
        localStorage.removeItem(key);
      } catch (err) {}

      if (GS_URL && GS_URL.startsWith('http')) {
        postScoreToGoogleSheet(scoreObtained, correctCount, wrongCount, skippedCount, timeSpent);
      }
    }

    function setReviewLanguage(lang) {
      selectedLanguage = lang;
      const enBtn = document.getElementById('btn-review-lang-en');
      const bnBtn = document.getElementById('btn-review-lang-bn');
      if (enBtn && bnBtn) {
        if (lang === 'bn') {
          bnBtn.className = "px-3 py-1.5 text-[10px] font-bold uppercase rounded cursor-pointer border-none bg-neutral-900 text-white shadow-sm";
          enBtn.className = "px-3 py-1.5 text-[10px] font-bold uppercase rounded cursor-pointer border-none text-gray-400 hover:text-gray-200 transition-colors bg-transparent";
        } else {
          enBtn.className = "px-3 py-1.5 text-[10px] font-bold uppercase rounded cursor-pointer border-none bg-neutral-900 text-white shadow-sm";
          bnBtn.className = "px-3 py-1.5 text-[10px] font-bold uppercase rounded cursor-pointer border-none text-gray-400 hover:text-gray-200 transition-colors bg-transparent";
        }
      }
      renderDetailedReview();
    }

    function renderDetailedReview() {
      const parent = document.getElementById('detailed-answers-review-list');
      parent.innerHTML = "";

      if ((QUIZ_TYPE === 'Passage' || QUIZ_TYPE === 'Cloze') && PASSAGE_DATA) {
        const passageBox = document.createElement('div');
        passageBox.className = "bg-[#1c1c1f] border rounded-2xl p-6 shadow-md mb-6 border-zinc-800";
        passageBox.innerHTML = "<h3 class='text-[10px] uppercase font-bold tracking-widest text-emerald-400 mb-3 border-b border-zinc-800 pb-2'>Comprehension / Cloze Passage</h3>" + 
                               "<p class='serif text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap text-justify'>" + PASSAGE_DATA + "</p>";
        parent.appendChild(passageBox);
      }

      QUESTIONS_DATA.forEach((q, idx) => {
        const chosenIdx = answers[idx];
        const correctIdx = q.correctIndex;
        const isCorrect = chosenIdx === correctIdx;
        const isSkipped = chosenIdx === undefined;

        const row = document.createElement('div');
        row.className = "bg-[#1c1c1f] border rounded-2xl p-6 shadow-md space-y-4 text-left border-zinc-800 text-zinc-100";

        const heading = document.createElement('div');
        heading.className = "flex items-center justify-between border-b border-zinc-800 pb-2.5";
        
        let statusBadge = "";
        if (isCorrect) {
          statusBadge = "<span class='text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20'>✅ Correct</span>";
        } else if (isSkipped) {
          statusBadge = "<span class='text-[9px] uppercase font-bold bg-zinc-800 text-zinc-400 px-2.5 py-0.5 rounded-full border border-zinc-700/30'>◽ Skipped</span>";
        } else {
          statusBadge = "<span class='text-[9px] uppercase font-bold bg-red-500/10 text-red-400 px-2.5 py-0.5 rounded-full border border-red-500/20'>❌ Incorrect</span>";
        }

        heading.innerHTML = "<span class='text-[10px] uppercase font-bold tracking-wider text-zinc-500'>Question " + (idx + 1) + "</span>" + statusBadge;
        row.appendChild(heading);

        let questionText = selectedLanguage === 'bn' ? (q.question_bn || q.question_en || q.question || "") : (q.question_en || q.question || "");
        let options = selectedLanguage === 'bn' ? (q.options_bn || q.options_en || q.options || []) : (q.options_en || q.options || []);
        let explanation = selectedLanguage === 'bn' ? (q.explanation_bn || q.explanation_en || "") : (q.explanation_en || "");

        const qp = document.createElement('p');
        qp.className = "text-sm text-zinc-200 font-semibold leading-relaxed";
        qp.innerText = questionText;
        row.appendChild(qp);

        if (QUIZ_TYPE === "Parajumble" && q.sentences) {
          const sentencesRef = document.createElement('div');
          sentencesRef.className = "space-y-1 bg-[#111113] px-3 py-2 rounded-lg border border-zinc-800 text-xs text-zinc-400 font-mono mb-2";
          Object.entries(q.sentences).forEach(([k, val]) => {
            const p = document.createElement('p');
            p.innerHTML = "<b class='text-emerald-400'>" + k + ":</b> " + val;
            sentencesRef.appendChild(p);
          });
          row.appendChild(sentencesRef);
        }

        const optGrid = document.createElement('div');
        optGrid.className = "grid grid-cols-1 gap-2 pt-1";

        options.forEach((optText, optIdx) => {
          const optCard = document.createElement('div');
          let cardStyle = "border rounded-xl px-4 py-2.5 text-xs transition-colors ";
          let pillText = "";

          if (optIdx === correctIdx) {
            cardStyle += "bg-emerald-500/10 border-emerald-500 text-emerald-300 font-medium";
            pillText = " <span class='text-[8px] uppercase tracking-wider bg-emerald-500 text-zinc-950 font-bold px-1.5 py-0.5 rounded ml-2 shadow-sm'>Correct Answer</span>";
          } else if (optIdx === chosenIdx) {
            cardStyle += "bg-red-500/10 border-red-500 text-red-300 font-medium";
            pillText = " <span class='text-[8px] uppercase tracking-wider bg-red-500 text-white font-bold px-1.5 py-0.5 rounded ml-2 shadow-sm'>Chosen Incorrect</span>";
          } else {
            cardStyle += "bg-[#111113]/70 border-zinc-800 text-zinc-400";
          }

          let optLetter = String.fromCharCode(65 + optIdx);
          optCard.className = cardStyle;
          optCard.innerHTML = "<b>" + optLetter + ".</b> " + optText + pillText;
          optGrid.appendChild(optCard);
        });
        row.appendChild(optGrid);

        if (explanation && explanation.trim()) {
          const cardExpl = document.createElement('div');
          cardExpl.className = "bg-emerald-500/10 border-l-2 border-emerald-500 p-4 rounded-r-xl mt-3 text-xs text-zinc-300 leading-relaxed";
          cardExpl.innerHTML = "<h4 class='font-bold uppercase text-[8px] tracking-wider text-emerald-400 mb-1'>Explanation</h4>" + explanation;
          row.appendChild(cardExpl);
        }

        parent.appendChild(row);
      });
    }

    async function postScoreToGoogleSheet(scores, rightQty, wrongQty, blankQty, duration) {
      const syncStatus = document.getElementById('sheets-sync-status');
      const syncMsg = document.getElementById('sync-msg');
      
      syncStatus.classList.remove('hidden');
      syncMsg.innerText = "Syncing results ledger...";

      const totalQuestions = QUESTIONS_DATA.length;
      const accuracy = totalQuestions > 0 ? Math.round((rightQty / totalQuestions) * 100) : 0;
      const localTime = new Date().toLocaleString('en-US');

      const statsPayload = {
        time: localTime,
        name: attendeeName,
        score: scores.toFixed(1),
        total: totalQuestions,
        percentage: accuracy + "%",
        accuracy: accuracy,

        correctCount: rightQty,
        wrongCount: wrongQty,
        skippedCount: blankQty,
        timeSpentSeconds: duration,
        timestamp: new Date().toISOString(),
        quizTitle: "${title}",
        quizType: QUIZ_TYPE,
        appletId: "1055e675-ca64-48c6-b29a-b9bb881d0289"
      };

      const queryParams = new URLSearchParams({
        time: localTime,
        name: attendeeName,
        score: scores.toFixed(1),
        total: String(totalQuestions),
        percentage: accuracy + "%",
        correctCount: String(rightQty),
        wrongCount: String(wrongQty),
        skippedCount: String(blankQty),
        appletId: "1055e675-ca64-48c6-b29a-b9bb881d0289"
      }).toString();

      const requestUrl = GS_URL.includes('?') ? GS_URL + '&' + queryParams : GS_URL + '?' + queryParams;

      try {
        await fetch(requestUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain'
          },
          body: JSON.stringify(statsPayload)
        });
        
        syncMsg.innerText = "Submitted successfully";
        syncStatus.className = "text-[11px] font-bold text-emerald-500 border-t border-zinc-800 pt-4 flex items-center justify-center gap-1.5";
      } catch (err) {
        console.error("Sheets update alert:", err);
        syncMsg.innerText = "Sheets ledger not reachable.";
        syncStatus.className = "text-[11px] font-bold text-amber-500 border-t border-zinc-800 pt-4 flex items-center justify-center gap-1.5";
      }
    }

    window.addEventListener('DOMContentLoaded', loadSavedState);
  </script>
</body>
</html>
`;
}

function getReactTemplate(quizType: QuizType) {
  return `
const { useState, useEffect } = React;

const APP_TITLE = "__APP_TITLE__";
const APP_SUBTITLE = "__APP_SUBTITLE__";
const CONFIG = __DEFAULT_CONFIG__;
const GS_URL = "__GOOGLE_SCRIPT_URL__";
const DEFAULT_LANGUAGE = "__DEFAULT_LANGUAGE__";

window.__PREPARSED_JSON__ = __INJECT_JSON_HERE__;
const PASSAGE_TEXT = __INJECT_PASSAGE_TEXT__;

function App() {
  const [data, setData] = useState(window.__PREPARSED_JSON__);
  const [started, setStarted] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [finished, setFinished] = useState(false);
  const [name, setName] = useState('');
  const [submittingSheet, setSubmittingSheet] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState('');
  const [lang, setLang] = useState(DEFAULT_LANGUAGE !== '__DEFAULT_LANGUAGE__' ? DEFAULT_LANGUAGE : 'en');
  const [timeLeft, setTimeLeft] = useState(CONFIG.totalTime || 600);

  const STORAGE_KEY_PREFIX = 'stand_alone_quiz_react_' + btoa(APP_TITLE).replace(/=/g, '');
  const LAST_NAME_KEY = 'stand_alone_quiz_react_last_name_' + btoa(APP_TITLE).replace(/=/g, '');
  
  const getStorageKey = (attendeeName) => {
    return STORAGE_KEY_PREFIX + '_' + btoa(attendeeName.toLowerCase().trim()).replace(/=/g, '');
  };

  const clearSessionState = (attendeeName) => {
    try {
      const key = getStorageKey(attendeeName);
      localStorage.removeItem(key);
    } catch(e) {}
  };

  useEffect(() => {
    try {
      const savedName = localStorage.getItem(LAST_NAME_KEY);
      if (savedName) {
        setName(savedName);
        
        // Auto-resume if there is an active session in progress for this student
        const key = getStorageKey(savedName);
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.started) {
            setCurrentIdx(parsed.currentIdx || 0);
            setAnswers(parsed.answers || {});
            setLang(parsed.lang || (DEFAULT_LANGUAGE !== '__DEFAULT_LANGUAGE__' ? DEFAULT_LANGUAGE : 'en'));
            setTimeLeft(parsed.timeLeft !== undefined ? parsed.timeLeft : (CONFIG.totalTime || 600));
            setStarted(true);
          }
        }
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    if (started && !finished && name.trim()) {
      try {
        const key = getStorageKey(name);
        const stateObj = {
          attendeeName: name,
          currentIdx,
          lang,
          answers,
          timeLeft,
          started: true
        };
        localStorage.setItem(key, JSON.stringify(stateObj));
      } catch (e) {
        console.error("Failed to save state", e);
      }
    }
  }, [started, finished, name, currentIdx, lang, answers, timeLeft]);

  useEffect(() => {
    let timer;
    if (started && !finished && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft <= 0 && started && !finished) {
      setFinished(true);
      submitToSheets();
      clearSessionState(name);
    }
    return () => clearInterval(timer);
  }, [started, finished, timeLeft]);

  const questions = Array.isArray(data) ? data : (data.questions || []);
  const maxQ = CONFIG.maxQuestions || questions.length;
  const currentQuestions = questions.slice(0, maxQ);
  const q = currentQuestions[currentIdx];

  const handleSelect = (idx) => {
    setAnswers({ ...answers, [currentIdx]: idx });
  };

  const calculateScore = () => {
    let score = 0;
    let right = 0;
    let wrong = 0;
    let skipped = 0;
    
    currentQuestions.forEach((q, i) => {
      if (answers[i] === undefined) skipped++;
      else if (answers[i] === q.correctIndex) {
        score += CONFIG.marksCorrect;
        right++;
      } else {
        score += CONFIG.marksWrong;
        wrong++;
      }
    });
    return { score, right, wrong, skipped };
  };

  const submitToSheets = async () => {
    if (!GS_URL || !GS_URL.startsWith('http')) return;
    setSubmittingSheet(true);
    setSubmittingStatus('Syncing results to Google Sheets database...');
    
    const stats = calculateScore();
    const totalQuestions = currentQuestions.length;
    const accuracy = totalQuestions > 0 ? Math.round((stats.right / totalQuestions) * 100) : 0;
    const localTime = new Date().toLocaleString('en-US');

    const statsPayload = {
      time: localTime,
      name: name || 'Guest Attendee',
      score: stats.score.toFixed(1),
      total: totalQuestions,
      percentage: accuracy + "%",
      accuracy: accuracy,

      correctCount: stats.right,
      wrongCount: stats.wrong,
      skippedCount: stats.skipped,
      timeSpentSeconds: CONFIG.totalTime - timeLeft,
      timestamp: new Date().toISOString(),
      quizTitle: APP_TITLE,
      quizType: "${quizType}",
      appletId: "1055e675-ca64-48c6-b29a-b9bb881d0289"
    };

    const queryParams = new URLSearchParams({
      time: localTime,
      name: name || 'Guest Attendee',
      score: stats.score.toFixed(1),
      total: String(totalQuestions),
      percentage: accuracy + "%",
      correctCount: String(stats.right),
      wrongCount: String(stats.wrong),
      skippedCount: String(stats.skipped),
      appletId: "1055e675-ca64-48c6-b29a-b9bb881d0289"
    }).toString();

    const requestUrl = GS_URL.includes('?') ? GS_URL + '&' + queryParams : GS_URL + '?' + queryParams;

    try {
      await fetch(requestUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(statsPayload)
      });
      setSubmittingStatus('✓ Synced to Google Sheets!');
    } catch (err) {
      console.error(err);
      setSubmittingStatus('Notice: Metrics failed to sync to Sheet script.');
    } finally {
      setSubmittingSheet(false);
    }
  };

  const handleFinish = () => {
    if (confirm("Submit and complete the quiz?")) {
      setFinished(true);
      submitToSheets();
      clearSessionState(name);
    }
  };

  const startQuiz = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Name is required");
      return;
    }
    
    try {
      localStorage.setItem(LAST_NAME_KEY, trimmed);
    } catch(e) {}

    const key = getStorageKey(trimmed);
    let loaded = false;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.started) {
          setCurrentIdx(parsed.currentIdx || 0);
          setAnswers(parsed.answers || {});
          setLang(parsed.lang || (DEFAULT_LANGUAGE !== '__DEFAULT_LANGUAGE__' ? DEFAULT_LANGUAGE : 'en'));
          setTimeLeft(parsed.timeLeft !== undefined ? parsed.timeLeft : (CONFIG.totalTime || 600));
          loaded = true;
        }
      }
    } catch(e) {
      console.error(e);
    }

    if (!loaded) {
      setCurrentIdx(0);
      setAnswers({});
      setTimeLeft(CONFIG.totalTime || 600);
    }
    
    setStarted(true);
  };

  if (!started) {
    return (
      <div className="min-h-screen bg-[#121214] py-16 flex items-center justify-center p-6 text-zinc-150">
        <div className="max-w-md w-full bg-[#1c1c1f] border border-zinc-800 p-8 rounded-3xl shadow-xl space-y-6 text-center">
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-[0.25em] text-emerald-400">Assessments Entry</span>
            <h1 className="serif text-3xl font-medium tracking-tight text-white">{APP_TITLE}</h1>
            <p className="text-xs text-zinc-400">{APP_SUBTITLE}</p>
          </div>

          <div className="border-t border-b border-zinc-800 py-4.5 text-left grid grid-cols-2 gap-4 text-xs text-zinc-400">
            <div>⏱️ Duration: <b>{Math.floor(CONFIG.totalTime / 60)}m {CONFIG.totalTime % 60}s</b></div>
            <div>📋 Questions: <b>{currentQuestions.length}</b></div>
            <div>🎉 Correct Answer: <b className="text-emerald-400">+{CONFIG.marksCorrect} pts</b></div>
            <div>⚠️ Incorrect Penalty: <b className="text-red-400">{CONFIG.marksWrong} pts</b></div>
          </div>

          <div className="text-left space-y-1.5">
            <label className="block text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Attendee Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name..." 
              className="w-full text-xs px-4 py-3 border border-zinc-800 rounded-xl bg-[#111113] text-zinc-100 focus:border-emerald-500 outline-none transition-all placeholder-zinc-600"
            />
          </div>

          <button 
            onClick={startQuiz} 
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] uppercase tracking-widest font-bold rounded-xl transition-all shadow-md cursor-pointer border-none"
          >
            Start Assessment
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    const stats = calculateScore();
    const maxScore = currentQuestions.length * CONFIG.marksCorrect;
    const accuracy = currentQuestions.length > 0 ? Math.round((stats.right / currentQuestions.length) * 100) : 0;

    return (
      <div className="min-h-screen bg-[#121214] py-12 p-6 text-zinc-150">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="bg-[#1c1c1f] border border-zinc-800 p-8 rounded-3xl text-center space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-[0.25em] text-emerald-400">Performance Record</span>
              <h1 className="serif text-3xl font-medium tracking-tight text-white">Quiz Handed In Successfully</h1>
              <p className="text-xs text-zinc-400 font-medium">Attendee: {name} · accuracy: {accuracy}%</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="text-center p-2">
                <span className="block text-[8px] uppercase tracking-wider text-zinc-500 font-bold">Total Score</span>
                <span className="serif text-2xl font-bold block mt-1 text-white">{stats.score.toFixed(1)} / {maxScore.toFixed(1)}</span>
              </div>
              <div class="text-center p-2 border-l border-zinc-800">
                <span className="block text-[8px] uppercase tracking-wider text-zinc-500 font-bold">Right Answers</span>
                <span className="serif text-2xl font-bold block mt-1 text-emerald-400">{stats.right}</span>
              </div>
              <div class="text-center p-2 border-l border-zinc-800">
                <span className="block text-[8px] uppercase tracking-wider text-zinc-500 font-bold">Wrong Answers</span>
                <span className="serif text-2xl font-bold block mt-1 text-red-500">{stats.wrong}</span>
              </div>
              <div class="text-center p-2 border-l border-zinc-800">
                <span className="block text-[8px] uppercase tracking-wider text-zinc-500 font-bold">Skipped Items</span>
                <span className="serif text-2xl font-bold block mt-1 text-gray-400">{stats.skipped}</span>
              </div>
            </div>

            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-2.5 bg-emerald-600 border-none hover:bg-emerald-700 text-white text-[10px] uppercase tracking-widest font-bold rounded-xl transition-all cursor-pointer shadow-md"
            >
              Retake Quiz
            </button>

            {submittingStatus && (
              <p className="text-[10px] text-emerald-400 font-semibold">{submittingStatus}</p>
            )}
          </div>

          {/* USER REQUESTED DETAIL VIEW */}
          <div className="space-y-4">
            <h3 className="serif text-xl italic text-white border-b border-zinc-800 pb-2 flex items-center justify-between">
              <span>Detailed Response Analysis</span>
              <span className="text-[10px] uppercase font-sans tracking-widest font-bold text-zinc-500">Review Matrix</span>
            </h3>

            {currentQuestions.some(item => (item.question_bn || item.options_bn)) && (
              <div className="flex justify-end gap-2 items-center my-3 select-none bg-zinc-900/30 p-2 rounded-xl border border-zinc-800/40">
                <span className="text-xs text-zinc-400 font-medium mr-1 font-sans">Review Language:</span>
                <button 
                  onClick={() => setLang('en')}
                  className={'px-3 py-1.5 text-[10px] font-bold uppercase rounded cursor-pointer border-none ' + (lang === 'en' ? 'bg-[#121214] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 transition-colors bg-transparent')}
                >
                  English
                </button>
                <button 
                  onClick={() => setLang('bn')}
                  className={'px-3 py-1.5 text-[10px] font-bold uppercase rounded cursor-pointer border-none ' + (lang === 'bn' ? 'bg-[#121214] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 transition-colors bg-transparent')}
                >
                  বাংলা
                </button>
              </div>
            )}

            <div className="space-y-5">
              {currentQuestions.map((questionItem, idx) => {
                const chosen = answers[idx];
                const correct = questionItem.correctIndex;
                const isRight = chosen === correct;
                const isSkipped = chosen === undefined;

                let questionText = lang === 'bn' ? (questionItem.question_bn || questionItem.question_en || questionItem.question) : (questionItem.question_en || questionItem.question);
                let optionsList = lang === 'bn' ? (questionItem.options_bn || questionItem.options_en || questionItem.options || []) : (questionItem.options_en || questionItem.options || []);
                let expl = lang === 'bn' ? (questionItem.explanation_bn || questionItem.explanation_en) : (questionItem.explanation_en);

                return (
                  <div key={idx} className="bg-[#1c1c1f] border border-zinc-800 p-6 rounded-2xl shadow-md space-y-4 text-left font-sans">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-550">Question {idx + 1}</span>
                      {isRight ? (
                        <span className="text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded border border-emerald-500/20">Correct</span>
                      ) : isSkipped ? (
                        <span className="text-[9px] uppercase font-bold bg-zinc-800 text-zinc-400 px-2.5 py-0.5 rounded border border-zinc-700/30">Skipped</span>
                      ) : (
                        <span className="text-[9px] uppercase font-bold bg-red-500/10 text-red-500 px-2.5 py-0.5 rounded border border-red-500/20">Incorrect</span>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-zinc-200 leading-relaxed">{questionText}</p>

                    {questionItem.sentences && (
                      <div className="space-y-1 bg-[#111113] p-3 rounded-lg border border-zinc-800 text-xs text-zinc-400 font-mono mb-2">
                        {Object.entries(questionItem.sentences).map(([letter, sentenceText]) => (
                          <div key={letter}><b className="text-emerald-400 mr-1">{letter}:</b> {sentenceText}</div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                      {optionsList.map((opt, optIdx) => {
                        let dynamicBorder = "border-zinc-800 bg-[#111113]/70 text-zinc-400";
                        let tag = null;

                        if (optIdx === correct) {
                          dynamicBorder = "border-emerald-500 bg-emerald-500/10 text-emerald-300 font-medium";
                          tag = "Correct Option";
                        } else if (optIdx === chosen) {
                          dynamicBorder = "border-red-550 bg-red-500/10 text-red-300 font-medium";
                          tag = "Your Choice";
                        }

                        return (
                          <div key={optIdx} className={'border rounded-xl px-4 py-2.5 text-xs flex items-center justify-between ' + dynamicBorder}>
                            <span><b>{String.fromCharCode(65 + optIdx)}.</b> {opt}</span>
                            {tag && <span className={'text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ' + (optIdx === correct ? 'bg-emerald-500 text-zinc-950' : 'bg-red-500 text-white')}>{tag}</span>}
                          </div>
                        );
                      })}
                    </div>

                    {expl && expl.trim() && (
                      <div className="bg-emerald-500/10 border-l-2 border-emerald-500 p-3.5 rounded-r-lg text-xs text-zinc-300 leading-relaxed">
                        <b className="block text-[8px] uppercase text-emerald-400 tracking-widest mb-1">Annotation & Explanation</b>
                        {expl}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!q) return <div className="text-center mt-20 text-zinc-400 font-sans">No question loaded.</div>;

  const isBilingual = q.question_bn && q.question_en;
  const questionText = lang === 'bn' && q.question_bn ? q.question_bn : (q.question_en || q.question);
  const options = lang === 'bn' && q.options_bn ? q.options_bn : (q.options_en || q.options || []);

  return (
    <div className="min-h-screen bg-[#121214] text-zinc-100 flex flex-col font-sans">
      <header className="bg-[#1c1c1f] border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0">
        <div>
          <h1 className="serif text-base font-semibold text-white">{APP_TITLE}</h1>
          <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-400">Attendee: {name}</span>
        </div>
        <div className="flex items-center gap-4">
          {isBilingual && (
            <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              <button className={'px-2.5 py-1 text-[10px] font-bold uppercase rounded cursor-pointer border-none ' + (lang === 'en' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300')} onClick={() => setLang('en')}>EN</button>
              <button className={'px-2.5 py-1 text-[10px] font-bold uppercase rounded cursor-pointer border-none ' + (lang === 'bn' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300')} onClick={() => setLang('bn')}>বাংলা</button>
            </div>
          )}
          <div className="px-3 py-1 bg-red-950/40 text-red-400 font-mono text-xs font-bold rounded-full border border-red-900/40 flex items-center gap-1 leading-none">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-0.5"></span>
            {Math.floor(timeLeft / 60)}:{('0' + (timeLeft % 60)).slice(-2)}
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full p-6 grid grid-cols-1 md:grid-cols-5 gap-6">
        {PASSAGE_TEXT && PASSAGE_TEXT !== '__INJECT_PASSAGE_TEXT__' && (
          <div className="md:col-span-2 bg-[#1c1c1f] border border-zinc-800 p-5 rounded-2xl shadow-sm overflow-y-auto max-h-[250px] md:max-h-[480px]">
            <span className="text-[8px] uppercase tracking-widest text-emerald-400 font-bold block mb-2">Comprehension reading text</span>
            <p className="serif text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{PASSAGE_TEXT}</p>
          </div>
        )}

        <div className={(PASSAGE_TEXT && PASSAGE_TEXT !== '__INJECT_PASSAGE_TEXT__') ? 'md:col-span-3 space-y-6 flex flex-col justify-between' : 'md:col-span-5 space-y-6 flex flex-col justify-between'}>
          <div className="bg-[#1c1c1f] border border-zinc-800 p-6 rounded-2xl shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400">Question {currentIdx + 1} of {currentQuestions.length}</span>
              <span className="text-[8px] uppercase tracking-widest font-bold text-zinc-500">Multiple Choice</span>
            </div>

            <p className="text-sm font-semibold text-zinc-200 leading-relaxed whitespace-pre-wrap">{questionText}</p>
            
            {q.sentences && (
              <div className="space-y-1.5 bg-[#111113] p-3 rounded-lg border border-zinc-800 text-xs text-zinc-400 font-mono">
                {Object.entries(q.sentences).map(([letter, sentenceText]) => (
                  <div key={letter}><b className="text-emerald-400 mr-1">{letter}:</b> {sentenceText}</div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 font-sans">
              {options.map((opt, i) => {
                const isSelected = answers[currentIdx] === i;
                return (
                  <div 
                    key={i} 
                    className={'border rounded-xl px-4 py-3 text-xs flex items-center justify-between cursor-pointer transition-colors ' + 
                      (isSelected 
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.2)]' 
                        : 'bg-[#111113]/70 border-zinc-800 text-zinc-400 hover:bg-zinc-900')}
                    onClick={() => handleSelect(i)}
                  >
                    <span><b>{String.fromCharCode(65 + i)}.</b> {opt}</span>
                    {isSelected && <span className="text-[8px] uppercase font-semibold text-emerald-400 tracking-wider">selected</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button className="px-4 py-2 bg-zinc-800 text-zinc-100 font-bold rounded-xl hover:bg-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer border-none" disabled={currentIdx === 0} onClick={() => setCurrentIdx(prev => prev - 1)}>Previous</button>
            {currentIdx < currentQuestions.length - 1 ? (
              <button className="px-5 py-2.5 bg-emerald-100 border-none hover:bg-emerald-200 text-emerald-950 text-xs font-bold rounded-xl shadow cursor-pointer transition-all" onClick={() => setCurrentIdx(prev => prev + 1)}>Next</button>
            ) : (
              <button className="px-5 py-2.5 bg-emerald-600 border-none hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-all" onClick={handleFinish}>Submit Quiz</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
`;
}

function getCssTemplate() {
  return `
:root {
  --primary: #10b981;
  --primary-hover: #059669;
  --bg: #FAFAFA;
  --surface: #ffffff;
  --text: #1F2937;
  --text-muted: #9CA3AF;
  --border: #E5E7EB;
}
body {
  margin: 0; padding: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
}
.header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border);
}
.title { font-size: 1.5rem; font-weight: 700; margin: 0; font-family: 'Georgia', serif;}
.subtitle { color: var(--text-muted); font-size: 0.9rem; margin-top: 8px;}
.timer { font-weight: 600; color: #ef4444; }
.btn {
  background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s;
}
.btn.outline { background: transparent; color: var(--primary); border: 1px solid var(--primary); }
.btn:hover { background: var(--primary-hover); }
.btn.outline:hover { background: var(--bg); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-small { padding: 4px 10px; margin-right: 8px; border-radius: 4px; border: 1px solid var(--primary); background: transparent; cursor: pointer; color: var(--primary); }
.btn-small.active { background: var(--primary); color: white; }
.passage { background: var(--surface); padding: 20px; border-radius: 8px; margin-bottom: 24px; border: 1px solid var(--border); line-height: 1.6; max-height: 250px; overflow-y: auto;}
.question-card { background: var(--surface); padding: 24px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.q-head { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 12px; font-weight: 600; }
.q-text { font-size: 1.1rem; line-height: 1.5; margin: 0 0 20px 0; font-weight: 500;}
.options { display: flex; flex-direction: column; gap: 12px; }
.option {
  padding: 14px 16px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: all 0.2s;
}
.option:hover { border-color: var(--primary); background: #fefcf9; }
.option.selected { border-color: var(--primary); background: #fbf6ef; color: var(--primary-hover); font-weight: 500; }
.nav-buttons { display: flex; justify-content: space-between; }
.mt-4 { margin-top: 16px; }
.score { font-size: 2rem; color: var(--primary); margin: 20px 0;}
  `;
}

export async function generateZipBundle(quizType: QuizType, config: QuizConfig, parsedData: any) {
  const zip = new JSZip();

  let jsContent = getReactTemplate(quizType);
  const cssContent = getCssTemplate();

  let dataArg = parsedData;
  let passageArg = '""';

  if (quizType === 'Passage' || quizType === 'Cloze') {
    dataArg = parsedData.questions;
    passageArg = JSON.stringify(parsedData.passage);
  }

  // Inject placeholders
  jsContent = jsContent
    .replace('"__APP_TITLE__"', JSON.stringify(config.title || quizType))
    .replace('"__APP_SUBTITLE__"', JSON.stringify(config.subtitle || ''))
    .replace('__DEFAULT_CONFIG__', JSON.stringify({
      totalTime: config.totalTime,
      marksCorrect: config.marksCorrect, 
      marksWrong: config.marksWrong,     
      maxQuestions: config.maxQuestions
    }))
    .replace('"__GOOGLE_SCRIPT_URL__"', JSON.stringify(config.gsUrl || ''))
    .replace('"__DEFAULT_LANGUAGE__"', config.defaultLang || "en")
    .replace('__INJECT_JSON_HERE__', JSON.stringify(dataArg))
    .replace('__INJECT_PASSAGE_TEXT__', passageArg);

  const htmlShell = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
  <link rel="stylesheet" href="style.css">
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" src="script.js"></script>
</body>
</html>`;

  const runnableHtml = getSingleHtmlTemplate(quizType, config, parsedData);

  zip.file('index.html', htmlShell);
  zip.file('style.css', cssContent);
  zip.file('script.js', jsContent);
  zip.file('Runnable_Quiz.html', runnableHtml);

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${quizType.replace(/\s+/g, '_')}_Quiz_Bundle.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
