import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Shield, RefreshCw, Check, AlertCircle, HelpCircle } from 'lucide-react';

export interface ApiKeyItem {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
}

interface KeyManagerProps {
  onKeysChanged: (keys: ApiKeyItem[]) => void;
}

export default function KeyManager({ onKeysChanged }: KeyManagerProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);

  // Load API keys from secure server pool
  useEffect(() => {
    async function loadApiKeys() {
      try {
        const response = await fetch('/api/keys');
        if (!response.ok) throw new Error('Failed to load keys from server');
        const data = await response.json();
        setKeys(data.keys || []);
        if (data.autoRotate !== undefined) {
          setAutoRotate(data.autoRotate);
        }
        onKeysChanged(data.keys || []);
      } catch (err: any) {
        console.error('Failed to load api keys', err);
        setError('Failed to load keys: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    }
    loadApiKeys();
  }, []);

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

    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmedKey, label: newLabel.trim() })
      });
      // Safe JSON parse — never let response.json() throw raw browser errors
      let data: any = {};
      try { data = await response.json(); } catch {
        throw new Error(response.ok
          ? 'Server returned an unreadable response. Please restart the app and try again.'
          : `Server error (${response.status}). Please restart the app.`);
      }
      if (!response.ok) {
        throw new Error(data.error || `Server error (${response.status})`);
      }
      setKeys(data.keys || []);
      setNewKey('');
      setNewLabel('');
      setSuccess('API key added to your secure pool!');
      onKeysChanged(data.keys || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteKey = async (id: string) => {
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      let data: any = {};
      try { data = await response.json(); } catch {
        throw new Error(`Server error (${response.status}). Please restart the app.`);
      }
      if (!response.ok) throw new Error(data.error || 'Failed to delete key');
      setKeys(data.keys || []);
      setSuccess('API key deleted from pool.');
      onKeysChanged(data.keys || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleKey = async (id: string) => {
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/keys/toggle/${id}`, { method: 'POST' });
      let data: any = {};
      try { data = await response.json(); } catch {
        throw new Error(`Server error (${response.status}). Please restart the app.`);
      }
      if (!response.ok) throw new Error(data.error || 'Failed to toggle key');
      setKeys(data.keys || []);
      onKeysChanged(data.keys || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleAutoRotate = async () => {
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/keys/rotate', { method: 'POST' });
      let data: any = {};
      try { data = await response.json(); } catch {
        throw new Error(`Server error (${response.status}). Please restart the app.`);
      }
      if (!response.ok) throw new Error(data.error || 'Failed to toggle auto-rotate');
      setAutoRotate(data.autoRotate);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const maskKey = (keyString: string) => {
    // Keys received from backend are already masked
    return keyString;
  };

  const activeCount = keys.filter(k => k.enabled).length;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#E5E7EB] dark:border-zinc-800 p-6 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-5 transition-colors">
      <div>
        <div className="flex items-center justify-between mb-1.5 animate-none">
          <h2 className="text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-2">
            <Shield size={12} className="text-emerald-700 dark:text-emerald-400" /> Gemini API Key Pool
          </h2>
          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded uppercase tracking-widest font-bold flex items-center gap-1 border border-solid border-emerald-100 dark:border-emerald-900/40">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mr-0.5"></span>
            {activeCount} Active
          </span>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-zinc-400 leading-relaxed font-sans">
          Supply your backup key pool. The engine automatically rotates keys to safeguard against 503 errors and exhaustion issues.
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
            <RefreshCw size={12} className="animate-spin text-emerald-700" /> Fetching configurations...
          </div>
        ) : keys.length === 0 ? (
          <div className="text-xs text-gray-400 dark:text-zinc-500 py-4 italic text-center bg-neutral-50 dark:bg-zinc-850/30 border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl font-sans">
            Key pool is currently empty. Utilizing system-generic runner credentials.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
            {keys.map((k, index) => (
              <div 
                key={k.id}
                className={`flex items-center justify-between p-2.5 border rounded-xl transition-all ${k.enabled ? 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800' : 'bg-neutral-50/50 dark:bg-zinc-850/40 border-gray-100 dark:border-zinc-800 opacity-60'}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center border font-mono text-[9px] ${k.enabled ? 'border-emerald-600/20 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/5 dark:border-emerald-400/202' : 'border-gray-200 dark:border-zinc-800 bg-neutral-150 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500'}`}>
                    {index + 1}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-gray-800 dark:text-zinc-200 flex items-center gap-1 font-sans">
                      {k.label}
                      {k.enabled && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      )}
                    </span>
                    <span className="text-[9px] font-mono text-gray-400 dark:text-zinc-500">{maskKey(k.key)}</span>
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
  );
}
