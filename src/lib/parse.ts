import type { ParsedFile, PlanRosterEntry, PlanTask, ProjectPlan, ReviewIssue, ReviewVerdict } from './types';

const FENCE_RE = /^(`{3,})([^\n`]*)\n([\s\S]*?)^\1[ \t]*$/gm;
const HEADER_RE = /\b(?:FILE|PATH)\s*:\s*`?([^\s`*"']+)`?|^#{1,6}\s+`?([^\s`]+\.[A-Za-z0-9]+)`?\s*$/gm;
const HEADER_LINE_RE = /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?\b(?:FILE|PATH)\s*:[^\n]*$/gm;

const SKIP_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'cmd', 'terminal']);

const EXT_BY_LANG: Record<string, string> = {
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  html: 'html',
  markdown: 'md',
  md: 'md',
  python: 'py',
  py: 'py',
  sql: 'sql',
  yaml: 'yml',
  yml: 'yml',
  text: 'txt',
  txt: 'txt',
};

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
  py: 'python',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  txt: 'text',
};

export type ReplyBlock =
  | { kind: 'text'; text: string }
  | { kind: 'code'; lang: string; code: string; path: string | null };

export function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function basename(path: string): string {
  const parts = normalizePath(path).split('/');
  return parts[parts.length - 1] || path;
}

export function languageFromPath(path: string): string {
  const ext = basename(path).split('.').pop()?.toLowerCase() ?? '';
  return LANG_BY_EXT[ext] ?? 'text';
}

export function isDocumentPath(path: string): boolean {
  return /\.(md|mdx|txt)$/i.test(path);
}

export function slugify(value: string, max = 40): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return slug || 'item';
}

function lastHeader(segment: string): string | null {
  let found: string | null = null;
  for (const match of segment.matchAll(HEADER_RE)) {
    found = match[1] ?? match[2] ?? found;
  }
  return found;
}

function pushText(blocks: ReplyBlock[], raw: string): void {
  const text = raw.replace(HEADER_LINE_RE, '').trim();
  if (text) blocks.push({ kind: 'text', text });
}

export function splitReply(reply: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  let cursor = 0;
  for (const match of reply.matchAll(FENCE_RE)) {
    const start = match.index ?? 0;
    const before = reply.slice(cursor, start);
    pushText(blocks, before);
    blocks.push({
      kind: 'code',
      lang: (match[2] ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '',
      code: (match[3] ?? '').replace(/\n$/, ''),
      path: lastHeader(before),
    });
    cursor = start + match[0].length;
  }
  pushText(blocks, reply.slice(cursor));
  return blocks;
}

export function extractFiles(reply: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  splitReply(reply).forEach((block, index) => {
    if (block.kind !== 'code' || SKIP_LANGS.has(block.lang) || !block.code.trim()) return;
    const path = normalizePath(block.path ?? `artifact-${index + 1}.${EXT_BY_LANG[block.lang] ?? 'txt'}`);
    files.push({
      path,
      language: block.lang || languageFromPath(path),
      content: block.code,
    });
  });
  return files;
}

export function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^`{3}(?:json)?\s*/i, '').replace(/`{3}\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON object was found in the reply.');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reqString(value: unknown, field: string, max = 400): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Field "${field}" must be a non-empty string.`);
  }
  return value.trim().slice(0, max);
}

function optString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function validatePlan(raw: unknown): ProjectPlan {
  if (!isRecord(raw)) throw new Error('The hiring plan must be a JSON object.');
  if (!Array.isArray(raw.roster) || raw.roster.length < 2 || raw.roster.length > 8) {
    throw new Error('"roster" must contain between 2 and 8 employees.');
  }
  if (!Array.isArray(raw.tasks) || raw.tasks.length < 1 || raw.tasks.length > 20) {
    throw new Error('"tasks" must contain between 1 and 20 items.');
  }

  const roster: PlanRosterEntry[] = [];
  const keys = new Set<string>();
  raw.roster.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) throw new Error(`roster[${index}] must be an object.`);
    let key = slugify(reqString(entry.key, `roster[${index}].key`, 60));
    if (keys.has(key)) key = `${key}-${index + 1}`;
    keys.add(key);
    roster.push({
      key,
      name: reqString(entry.name, `roster[${index}].name`, 80),
      title: reqString(entry.title, `roster[${index}].title`, 120),
      department: reqString(entry.department, `roster[${index}].department`, 40),
      specialty: optString(entry.specialty, 'General delivery').slice(0, 300),
    });
  });

  const paths = new Set<string>();
  const tasks: PlanTask[] = raw.tasks.map((task: unknown, index: number) => {
    if (!isRecord(task)) throw new Error(`tasks[${index}] must be an object.`);
    const assigneeKey = slugify(reqString(task.assigneeKey, `tasks[${index}].assigneeKey`, 60));
    if (!keys.has(assigneeKey)) {
      throw new Error(`tasks[${index}].assigneeKey "${assigneeKey}" does not match any roster key.`);
    }
    const deliverablePath = normalizePath(reqString(task.deliverablePath, `tasks[${index}].deliverablePath`, 200));
    if (paths.has(deliverablePath)) {
      throw new Error(`Duplicate deliverablePath "${deliverablePath}".`);
    }
    paths.add(deliverablePath);
    return {
      id: optString(task.id, `T${index + 1}`),
      title: reqString(task.title, `tasks[${index}].title`, 160),
      description: reqString(task.description, `tasks[${index}].description`, 4000),
      assigneeKey,
      deliverablePath,
    };
  });

  return {
    projectName: slugify(optString(raw.projectName, 'project'), 40),
    summary: optString(raw.summary, '').slice(0, 600),
    roster,
    tasks,
  };
}

export function validateReview(raw: unknown): ReviewVerdict {
  if (!isRecord(raw)) throw new Error('The review must be a JSON object.');
  if (typeof raw.approved !== 'boolean') throw new Error('"approved" must be a boolean.');

  const issues: ReviewIssue[] = Array.isArray(raw.issues)
    ? raw.issues
        .filter(isRecord)
        .slice(0, 6)
        .map((issue) => {
          const assigneeKey = optString(issue.assigneeKey);
          return {
            path: normalizePath(optString(issue.path)),
            problem: optString(issue.problem, 'Unspecified problem'),
            fix: optString(issue.fix, 'Fix the issue'),
            assigneeKey: assigneeKey ? slugify(assigneeKey, 60) : '',
          };
        })
    : [];

  return {
    approved: raw.approved,
    message: optString(raw.message, 'Review complete.'),
    issues,
  };
}
