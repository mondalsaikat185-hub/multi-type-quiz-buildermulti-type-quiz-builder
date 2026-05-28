import React, { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Shield, RefreshCw, Check, AlertCircle, HelpCircle, Cloud, CloudOff } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface ApiKeyItem {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
}

interface KeyManagerProps {
  onKeysChanged: (keys: ApiKeyItem[]) => void;
}

// Firebase Firestore document path for API keys
const KEYS_DOC_PATH = 'config';
const KEYS_DOC_ID = 'api_keys';

function maskKeyForDisplay(k: string): string {
  if (!k || k.length <= 12) return '●●●●●●●●';
  return `${k.slice(0, 8)}...${k.slice(-4)}`;
}

export default function KeyManager({ onKeysChanged }: KeyManagerProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState(true);

  // ── Save keys to Firebase ──────────────────────────────────────────────
  const saveKeysToFirebase = useCallback(async (keysToSave: ApiKeyItem[], rotate: boolean) => {
    try {
      const docRef = doc(db, KEYS_DOC_PATH, KEYS_DOC_ID);
      await setDoc(docRef, {
        keys: keysToSave,
        autoRotate: rotate,
        updatedAt: new Date().toISOString()
      });
      setFirebaseConnected(true);
      console.log('[KeyManager] Keys saved to Firebase Firestore.');
    } catch (err) {
      console.error('[KeyManager] Failed to save keys to Firebase:', err);
      setFirebaseConnected(false);
      // Fallback: save to localStorage
      localStorage.setItem('quiz_keys_fallback', JSON.stringify(keysToSave));
    }
  }, []);

  // ── Load keys from Firebase on mount ───────────────────────────────────
  useEffect(() => {
    async function loadApiKeys() {
      // 1. Try loading from Firebase Firestore first
      try {
        const docRef = doc(db, KEYS_DOC_PATH, KEYS_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const loadedKeys: ApiKeyItem[] = data.keys || [];
          const loadedRotate = data.autoRotate !== undefined ? data.autoRotate : true;

          setKeys(loadedKeys);
          setAutoRotate(loadedRotate);
          onKeysChanged(loadedKeys);
          setFirebaseConnected(true);

          // Also cache to localStorage as backup
          localStorage.setItem('quiz_keys_fallback', JSON.stringify(loadedKeys));
          console.log(`[KeyManager] Loaded ${loadedKeys.length} keys from Firebase.`);
        } else {
          // Document doesn't exist yet — check localStorage fallback
          const fallbackStr = localStorage.getItem('quiz_keys_fallback');
          let localKeys: ApiKeyItem[] = [];
          if (fallbackStr) {
            try { localKeys = JSON.parse(fallbackStr); } catch {}
          }

          setKeys(localKeys);
          onKeysChanged(localKeys);
          setFirebaseConnected(true);

          // If we have local keys, migrate them to Firebase
          if (localKeys.length > 0) {
            await saveKeysToFirebase(localKeys, true);
            console.log('[KeyManager] Migrated localStorage keys to Firebase.');
          }
        }
      } catch (err) {
        console.warn('[KeyManager] Firebase load failed, falling back to localStorage:', err);
        setFirebaseConnected(false);

        // Fallback to localStorage
        const fallbackStr = localStorage.getItem('quiz_keys_fallback');
        let localKeys: ApiKeyItem[] = [];
        if (fallbackStr) {
          try { localKeys = JSON.parse(fallbackStr); } catch {}
        }
        setKeys(localKeys);
        onKeysChanged(localKeys);
      } finally {
        setIsLoading(false);
      }
    }

    loadApiKeys();
  }, []);

  // ── Update parent and persist whenever keys change ─────────────────────
  const updateKeys = useCallback(async (newKeys: ApiKeyItem[], newRotate?: boolean) => {
    const rotate = newRotate !== undefined ? newRotate : autoRotate;
    setKeys(newKeys);
    onKeysChanged(newKeys);

    // Save to both Firebase and localStorage
    localStorage.setItem('quiz_keys_fallback', JSON.stringify(newKeys));
    await saveKeysToFirebase(newKeys, rotate);
  }, [autoRotate, onKeysChanged, saveKeysToFirebase]);

  // ── Add key ────────────────────────────────────────────────────────────
  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newKey.trim()) {
      setError('API Key cannot be empty');
      return;
    }

    const trimmedKey = newKey.trim();
    if (!trimmedKey.startsWith('AIzaSy')) {
      setError('Warning: Key does not look like a standard Google Gemini API key (should start with AIzaSy)');
      return;
    }

    // Check for duplicates
    const duplicate = keys.some(k => k.key === trimmedKey);
    if (duplicate) {
      setError('This API key is already in the pool');
      return;
    }

    const newItem: ApiKeyItem = {
      id: 'key_' + Date.now(),
      key: trimmedKey,
      label: newLabel.trim() || `Key Pool #${keys.length + 1}`,
      enabled: true,
    };

    const updatedKeys = [...keys, newItem];
    await updateKeys(updatedKeys);

    setNewKey('');
    setNewLabel('');
    setSuccess(firebaseConnected
      ? '✅ API key added & synced to Firebase cloud!'
      : '✅ API key saved to browser storage (Firebase offline)');
  };

  // ── Delete key ─────────────────────────────────────────────────────────
  const handleDeleteKey = async (id: string) => {
    setError('');
    setSuccess('');

    const updatedKeys = keys.filter(k => k.id !== id);
    await updateKeys(updatedKeys);
    setSuccess('API key deleted.');
  };

  // ── Toggle key enable/disable ──────────────────────────────────────────
  const handleToggleKey = async (id: string) => {
    setError('');
    setSuccess('');

    const updatedKeys = keys.map(k =>
      k.id === id ? { ...k, enabled: !k.enabled } : k
    );
    await updateKeys(updatedKeys);
  };

  // ── Toggle auto-rotate ────────────────────────────────────────────────
  const handleToggleAutoRotate = async () => {
    setError('');
    setSuccess('');

    const newRotate = !autoRotate;
    setAutoRotate(newRotate);
    await saveKeysToFirebase(keys, newRotate);
  };

  const activeCount = keys.filter(k => k.enabled).length;

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-black/40 dark:bg-black/60 z-30 lg:hidden backdrop-blur-[1px] transition-all duration-300"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      <div className={`
        fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 rounded-t-3xl shadow-[0_-8px_30px_rgb(0,0,0,0.12)] p-6 max-h-[85vh] overflow-y-auto space-y-5 transition-transform duration-300 ease-in-out
        ${isDrawerOpen ? 'translate-y-0' : 'translate-y-[calc(100%-60px)]'}
        lg:static lg:w-auto lg:h-auto lg:border lg:border-[#E5E7EB] lg:dark:border-zinc-800 lg:shadow-[0_1px_3px_rgba(0,0,0,0.02)] lg:rounded-2xl lg:p-6 lg:max-h-none lg:transform-none lg:overflow-visible lg:space-y-5 lg:transition-colors
      `}>
        {/* Toggle-able Header zone on mobile */}
        <div 
          onClick={() => {
            if (window.innerWidth < 1024) {
              setIsDrawerOpen(!isDrawerOpen);
            }
          }}
          className="cursor-pointer lg:cursor-default"
        >
          {/* Pull Handle at the top of the bottom sheet on mobile */}
          <div className="lg:hidden w-12 h-1 bg-gray-200 dark:bg-zinc-700 rounded-full mx-auto mb-4" />
          
          <div className="flex items-center justify-between mb-1.5 animate-none">
            <h2 className="text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-2">
              <Shield size={12} className="text-emerald-700 dark:text-emerald-400" /> Gemini API Key Pool
            </h2>
            <div className="flex items-center gap-2">
              {/* Firebase connection indicator */}
              <span className={`text-[8px] uppercase tracking-wider font-bold flex items-center gap-1 px-1.5 py-0.5 rounded border border-solid ${
                firebaseConnected 
                  ? 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-100 dark:border-sky-900/40' 
                  : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40'
              }`}>
                {firebaseConnected ? <Cloud size={9} /> : <CloudOff size={9} />}
                {firebaseConnected ? 'Firebase' : 'Local'}
              </span>
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded uppercase tracking-widest font-bold flex items-center gap-1 border border-solid border-emerald-100 dark:border-emerald-900/40">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mr-0.5"></span>
                {activeCount} Active
              </span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-400 leading-relaxed font-sans lg:block hidden">
            Supply your backup key pool. Keys are securely stored in Firebase Firestore — no Vercel redeploy needed. The engine automatically rotates keys to safeguard against rate-limit errors.
          </p>
          <p className="text-[10px] text-gray-500 dark:text-zinc-500 font-sans lg:hidden inline-block italic">
            {isDrawerOpen ? 'Tap here to collapse Key Manager' : 'Tap/Pull here to configure Gemini API keys'}
          </p>
        </div>

        <div className="bg-neutral-50/50 dark:bg-zinc-850/60 border border-gray-150 dark:border-zinc-800 p-3 rounded-xl flex items-center justify-between transition-colors">
          <div className="flex flex-col gap-0.5 font-sans">
            <span className="text-xs font-semibold text-gray-800 dark:text-zinc-200">Automatic Rotation Safeguard</span>
            <span className="text-[10px] text-gray-400 dark:text-zinc-500">Rolls to next active key upon transient failures</span>
          </div>
          <button 
            onClick={handleToggleAutoRotate}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoRotate ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-gray-200 dark:bg-zinc-750'}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoRotate ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>

        <form onSubmit={handleAddKey} className="space-y-3.5 pt-3 border-t border-gray-100 dark:border-zinc-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1 font-sans">Key Label</label>
              <input 
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Primary Key"
                className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all placeholder-gray-300 dark:placeholder-zinc-600"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-semibold mb-1 flex items-center justify-between font-sans">
                <span>Google API Key</span>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-700 dark:text-emerald-400 lowercase tracking-normal text-[9px] hover:underline">Get Key ↗</a>
              </label>
              <input 
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg bg-neutral-50/50 dark:bg-zinc-850 text-gray-800 dark:text-zinc-100 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-600 dark:focus:ring-emerald-400 outline-none transition-all placeholder-gray-300 dark:placeholder-zinc-650"
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-white text-[10px] uppercase tracking-widest font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 border-none cursor-pointer"
          >
            <Plus size={12} className="text-emerald-700 dark:text-emerald-400" /> Append Key to Pool
          </button>
        </form>

        {error && (
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-950/30 p-2.5 border border-red-200/50 dark:border-red-900/40 rounded-lg">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs bg-emerald-50 dark:bg-emerald-950/30 p-2.5 border border-emerald-200/50 dark:border-emerald-900/40 rounded-lg">
            <Check size={14} className="shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-zinc-800">
          <span className="block text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-400 font-bold mb-1.5 font-sans">Members in Pool ({keys.length})</span>
          
          {isLoading ? (
            <div className="text-xs text-gray-400 py-1 italic flex items-center gap-1.5 font-sans">
              <RefreshCw size={12} className="animate-spin text-emerald-700" /> Fetching configurations from Firebase...
            </div>
          ) : keys.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-zinc-500 py-4 italic text-center bg-neutral-50 dark:bg-zinc-850/30 border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl font-sans">
              Key pool is currently empty. Add your Gemini API keys above — they'll be synced to Firebase automatically.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {keys.map((k, index) => (
                <div 
                  key={k.id}
                  className={`flex items-center justify-between p-2.5 border rounded-xl transition-all ${k.enabled ? 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800' : 'bg-neutral-50/50 dark:bg-zinc-850/40 border-gray-100 dark:border-zinc-800 opacity-60'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border font-mono text-[9px] ${k.enabled ? 'border-emerald-600/20 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/5 dark:border-emerald-400/20' : 'border-gray-200 dark:border-zinc-800 bg-neutral-150 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500'}`}>
                      {index + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold text-gray-800 dark:text-zinc-200 flex items-center gap-1 font-sans">
                        {k.label}
                        {k.enabled && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        )}
                      </span>
                      <span className="text-[9px] font-mono text-gray-400 dark:text-zinc-500">{maskKeyForDisplay(k.key)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => handleToggleKey(k.id)}
                      className={`px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-bold rounded cursor-pointer border-none transition-colors ${k.enabled ? 'bg-emerald-50 dark:bg-emerald-950/55 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 hover:bg-gray-200'}`}
                    >
                      {k.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => handleDeleteKey(k.id)}
                      className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer border-none bg-transparent transition-colors"
                      title="Remove key from pool"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
