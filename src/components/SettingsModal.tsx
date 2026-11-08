'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, ExternalLink, KeyRound, X } from 'lucide-react';
import type { AppSettings } from '@/lib/storage';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

const KEY_PREFIX = 'gsk_';
const GROQ_KEYS_URL = 'https://console.groq.com/keys';
const MODEL_LABEL = 'Llama 3.1 8B Instant';

export default function SettingsModal({ open, settings, onSave, onClose }: SettingsModalProps) {
  const [draftKey, setDraftKey] = useState(settings.apiKey);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (open) setDraftKey(settings.apiKey);
  }, [open, settings.apiKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = draftKey.trim();
  const isEmpty = trimmed.length === 0;
  const looksValid = isEmpty || trimmed.startsWith(KEY_PREFIX);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!looksValid) return;
    onSave({ apiKey: trimmed });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md animate-fade-in-up rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/40">
              <KeyRound className="h-4 w-4 text-indigo-300" />
            </div>
            <div>
              <h2 id="settings-title" className="text-base font-semibold text-zinc-100">
                Settings
              </h2>
              <p className="text-xs text-zinc-500">Stored only in this browser (localStorage).</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label htmlFor="groq-key" className="mb-1.5 block text-xs font-medium text-zinc-400">
          Groq API Key (<span className="font-mono">gsk_...</span>)
        </label>
        <div className="relative">
          <input
            id="groq-key"
            type={reveal ? 'text' : 'password'}
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="gsk_..."
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!looksValid}
            aria-describedby="groq-key-help"
            className={`w-full rounded-lg border bg-zinc-950 py-2.5 pl-3 pr-10 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 ${
              looksValid
                ? 'border-zinc-800 focus:border-indigo-500 focus:ring-indigo-500/30'
                : 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/30'
            }`}
          />
          <button
            type="button"
            onClick={() => setReveal((value) => !value)}
            aria-label={reveal ? 'Hide key' : 'Show key'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-200"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <p id="groq-key-help" className="mt-2 text-xs text-zinc-500">
          {looksValid ? (
            <>
              Create a free key at{' '}
              <a
                href={GROQ_KEYS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-300 underline-offset-2 hover:underline"
              >
                console.groq.com/keys
                <ExternalLink className="h-3 w-3" />
              </a>
              . The key is sent to this app&apos;s API route and forwarded to Groq. It is never stored on the server.
            </>
          ) : (
            <span className="text-rose-300">Groq keys start with gsk_. Check the key and try again.</span>
          )}
        </p>

        <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
          <p className="text-xs text-zinc-500">Model</p>
          <p className="font-mono text-sm text-zinc-200">{MODEL_LABEL}</p>
          <p className="text-xs text-zinc-500">Served by Groq Cloud with a free tier.</p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDraftKey('')}
            className="text-xs text-zinc-500 transition hover:text-rose-300"
          >
            Clear key
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!looksValid}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
