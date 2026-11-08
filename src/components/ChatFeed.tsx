'use client';

import { useEffect, useRef } from 'react';
import { Crown, Hash, Loader2, Package, Sparkles } from 'lucide-react';
import type { AgentRecord, ChatMessage, CompanyPhase, RoomRecord } from '@/lib/types';
import { splitReply } from '@/lib/parse';

interface ChatFeedProps {
  room: RoomRecord | undefined;
  messages: ChatMessage[];
  agents: AgentRecord[];
  phase: CompanyPhase | null;
  running: boolean;
}

interface Author {
  name: string;
  color: string;
}

const CHAIRMAN: Author = { name: 'Chairman', color: '#818cf8' };
const SYSTEM: Author = { name: 'System', color: '#52525b' };
const BOARDROOM_LABEL = 'executive-boardroom';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={index} className="font-semibold text-zinc-100">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function RichText({ content }: { content: string }) {
  const blocks = splitReply(content);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
      {blocks.map((block, index) =>
        block.kind === 'code' ? (
          <details
            key={index}
            className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-mono text-xs text-zinc-400 hover:text-zinc-200">
              <span className="truncate">{block.path ?? `snippet.${block.lang || 'txt'}`}</span>
              <span className="shrink-0 text-zinc-600">{block.code.split('\n').length} lines</span>
            </summary>
            <pre className="max-h-96 overflow-auto border-t border-zinc-800 p-3 font-mono text-xs leading-5 text-zinc-300">
              <code>{block.code}</code>
            </pre>
          </details>
        ) : (
          <p key={index} className="whitespace-pre-wrap">
            {renderInline(block.text)}
          </p>
        ),
      )}
    </div>
  );
}

function MessageRow({ message, author }: { message: ChatMessage; author: Author }) {
  if (message.kind === 'system' || message.kind === 'deliverable') {
    return (
      <div className="animate-fade-in-up flex items-center gap-2 pl-11 text-xs text-zinc-500">
        {message.kind === 'deliverable' ? (
          <Package className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
        )}
        <span className="font-mono">{message.content}</span>
      </div>
    );
  }

  const isCommand = message.kind === 'command';
  const isHandover = message.kind === 'handover';

  return (
    <article className="animate-fade-in-up flex gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-zinc-950"
        style={{ backgroundColor: author.color }}
      >
        {initials(author.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold" style={{ color: author.color }}>
            {author.name}
          </span>
          <time className="text-[11px] text-zinc-600">{formatTime(message.createdAt)}</time>
          {isCommand && (
            <span className="rounded bg-indigo-500/15 px-1.5 text-[10px] font-medium uppercase tracking-wide text-indigo-300">
              Command
            </span>
          )}
          {isHandover && (
            <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
              Handover
            </span>
          )}
        </div>
        <div
          className={`mt-1 rounded-xl border px-4 py-3 ${
            isCommand
              ? 'border-indigo-500/40 bg-indigo-500/10'
              : isHandover
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-zinc-800 bg-zinc-900/70'
          }`}
        >
          <RichText content={message.content} />
        </div>
      </div>
    </article>
  );
}

export default function ChatFeed({ room, messages, agents, phase, running }: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = room ? messages.filter((m) => m.roomId === room.id) : [];
  const byId = new Map<string, AgentRecord>(agents.map((a) => [a.id, a]));

  const authorOf = (id: string): Author => {
    if (id === 'chairman') return CHAIRMAN;
    if (id === 'system') return SYSTEM;
    const agent = byId.get(id);
    return agent ? { name: agent.name, color: agent.color } : SYSTEM;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
        <Hash className="h-4 w-4 shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-zinc-100">{room?.name ?? BOARDROOM_LABEL}</h2>
          <p className="truncate text-xs text-zinc-500">{room?.topic ?? 'Issue a command to convene the board.'}</p>
        </div>
        {phase && (
          <span className="hidden shrink-0 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-400 sm:inline">
            {phase}
          </span>
        )}
        {running && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Live
          </span>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {visible.length === 0 ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
            <Crown className="h-10 w-10 text-zinc-700" />
            <p className="max-w-sm text-sm text-zinc-500">
              The Chairman has not issued a command yet. Enter a directive above and the executive board will convene.
            </p>
          </div>
        ) : (
          visible.map((message) => (
            <MessageRow key={message.id} message={message} author={authorOf(message.authorId)} />
          ))
        )}
      </div>
    </section>
  );
}
