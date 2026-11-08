'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';
import type { AppSettings } from '@/lib/storage';
import type { ModelId } from '@/lib/types';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

const MODELS: { id: ModelId; label: string; note: string }[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Fastest. Best for most runs.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Deeper reasoning. Slower, with a tighter free quota.' },
];

export default function SettingsModal({ open, settings, onSave, onClose }: SettingsModalProps) {
  const [draftKey, setDraftKey] = useState(settings.apiKey);
  const [draftModel, setDraftModel] = useState<ModelId>(settings.model);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftKey(settings.apiKey);
    setDraftModel(settings.model);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ apiKey: draftKey.trim(), model: draftModel });
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

        <label htmlFor="gemini-key" className="mb-1.5 block text-xs font-medium text-zinc-400">
          Gemini API key
        </label>
        <div className="relative">
          <input
            id="gemini-key"
            type={reveal ? 'text' : 'password'}
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-3 pr-10 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide key' : 'Show key'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-200"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Get a free key at{' '}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-300 underline-offset-2 hover:underline"
          >
            Google AI Studio
          </a>
          . The key is sent to the simulator&apos;s own API route and forwarded to Google. It is never stored on the server.
        </p>

        <fieldset className="mt-5">
          <legend className="mb-1.5 text-xs font-medium text-zinc-400">Model</legend>
          <div className="grid gap-2">
            {MODELS.map((model) => (
              <label
                key={model.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                  draftModel === model.id
                    ? 'border-indigo-500/60 bg-indigo-500/10'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  value={model.id}
                  checked={draftModel === model.id}
                  onChange={() => setDraftModel(model.id)}
                  className="mt-1 accent-indigo-500"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-100">{model.label}</span>
                  <span className="block text-xs text-zinc-500">{model.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

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
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
