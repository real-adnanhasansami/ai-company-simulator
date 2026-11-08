'use client';

import type { FormEvent } from 'react';
import { Crown, Play, RotateCcw, Settings, Square } from 'lucide-react';
import type { CompanyPhase } from '@/lib/types';

interface TopBarProps {
  command: string;
  onCommandChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
  running: boolean;
  phase: CompanyPhase | null;
  hasApiKey: boolean;
}

const PHASE_LABEL: Record<CompanyPhase, string> = {
  boardroom: 'Boardroom',
  hiring: 'Hiring',
  department: 'Department work',
  inspection: 'Inspection',
  revision: 'Revisions',
  handover: 'CEO handover',
  complete: 'Complete',
  stopped: 'Stopped',
  error: 'Error',
};

const PHASE_STYLE: Record<CompanyPhase, string> = {
  boardroom: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
  hiring: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  department: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  inspection: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  revision: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  handover: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  complete: 'bg-zinc-700/40 text-zinc-200 ring-zinc-600',
  stopped: 'bg-zinc-800 text-zinc-400 ring-zinc-700',
  error: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

export default function TopBar({
  command,
  onCommandChange,
  onStart,
  onStop,
  onReset,
  onOpenSettings,
  running,
  phase,
  hasApiKey,
}: TopBarProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!running && command.trim()) onStart();
  };

  return (
    <header className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 backdrop-blur lg:flex-row lg:items-center">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/40">
          <Crown className="h-5 w-5 text-indigo-300" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-zinc-100">AI Company Simulator</h1>
          <p className="text-xs text-zinc-500">Chairman&apos;s console</p>
        </div>
        <span
          className={`ml-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
            phase ? PHASE_STYLE[phase] : 'bg-zinc-800 text-zinc-400 ring-zinc-700'
          }`}
        >
          {phase ? PHASE_LABEL[phase] : 'Idle'}
        </span>
      </div>

      <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2">
        <input
          value={command}
          onChange={(event) => onCommandChange(event.target.value)}
          disabled={running}
          placeholder="Chairman command, e.g. Build an MVP SaaS for landing page audits"
          aria-label="Chairman command"
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={running || !command.trim() || !hasApiKey}
          title={hasApiKey ? undefined : 'Add a Gemini API key in Settings first'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="h-4 w-4" />
          Convene
        </button>
      </form>

      <div className="flex items-center gap-2">
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20"
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800"
        >
          <Settings className="h-4 w-4" />
          {!hasApiKey && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400" />}
        </button>
      </div>
    </header>
  );
}
