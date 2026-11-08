'use client';

import { useState } from 'react';
import { Check, Copy, Download, FileCode2, FileText, Package } from 'lucide-react';
import type { Deliverable } from '@/lib/types';

const MAX_PREVIEW_LINES = 2000;

const TOKEN_RE =
  /(\/\/.*$|\/\*.*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\b(?:import|export|from|const|let|var|function|return|if|else|async|await|type|interface|class|extends|implements|new|default|true|false|null|undefined|void|try|catch|throw|for|of|in|as)\b)/;

function highlight(line: string) {
  return line.split(TOKEN_RE).map((part, index) => {
    if (index % 2 === 0) return part;
    const isComment = part.startsWith('//') || part.startsWith('/*');
    const isString = /^["'`]/.test(part);
    const className = isComment ? 'text-zinc-500 italic' : isString ? 'text-emerald-300' : 'text-indigo-300';
    return (
      <span key={index} className={className}>
        {part}
      </span>
    );
  });
}

function CodePreview({ content }: { content: string }) {
  const all = content.split('\n');
  const lines = all.slice(0, MAX_PREVIEW_LINES);
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 font-mono text-xs leading-5">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className="hover:bg-zinc-900/60">
              <td className="w-12 select-none pr-3 text-right align-top text-zinc-600">{index + 1}</td>
              <td className="whitespace-pre pr-4 align-top text-zinc-300">{highlight(line)}</td>
            </tr>
          ))}
          {all.length > MAX_PREVIEW_LINES && (
            <tr>
              <td />
              <td className="py-2 text-zinc-500">
                Preview capped at {MAX_PREVIEW_LINES} lines. Download the file for the full content.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface DeliverableVaultProps {
  deliverables: Deliverable[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function DeliverableVault({ deliverables, selectedId, onSelect }: DeliverableVaultProps) {
  const [copied, setCopied] = useState(false);
  const sorted = [...deliverables].sort((a, b) => a.path.localeCompare(b.path));
  const selected: Deliverable | null =
    deliverables.find((d) => d.id === selectedId) ?? deliverables[deliverables.length - 1] ?? null;

  const download = (file: Deliverable) => {
    const blob = new Blob([file.content], {
      type: file.kind === 'document' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.path.replace(/\//g, '__');
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copy = async (file: Deliverable) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-zinc-900/60">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Deliverables Vault</h2>
        </div>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          {deliverables.length} files
        </span>
      </header>

      {deliverables.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <Package className="h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-500">
            No deliverables yet. Code and documents appear here as employees finish their tasks.
          </p>
        </div>
      ) : (
        <>
          <ul className="max-h-48 overflow-y-auto border-b border-zinc-800 p-2">
            {sorted.map((file) => {
              const active = selected?.id === file.id;
              const Icon = file.kind === 'document' ? FileText : FileCode2;
              return (
                <li key={file.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(file.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                      active ? 'bg-indigo-500/15 text-indigo-200' : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                    <span className="shrink-0 text-[10px] text-zinc-600">v{file.version}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">{selected.name}</p>
                  <p className="truncate font-mono text-[11px] text-zinc-500">
                    {selected.path} · {selected.language} · {selected.content.split('\n').length} lines · by{' '}
                    {selected.authorId.replace(/^emp-/, '')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(selected)}
                  aria-label="Copy file contents"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => download(selected)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-zinc-950 transition hover:bg-emerald-400"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
              <CodePreview content={selected.content} />
            </div>
          )}
        </>
      )}
    </aside>
  );
}
