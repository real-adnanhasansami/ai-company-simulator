'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentRecord,
  AgentStatus,
  ChatMessage,
  CompanyPhase,
  CompanySnapshot,
  Deliverable,
  MessageKind,
  ParsedFile,
  PlanTask,
  ProjectPlan,
  ReviewIssue,
  RoomRecord,
} from '@/lib/types';
import {
  boardroomPrompt,
  clip,
  handoverPrompt,
  hiringPrompt,
  reviewPrompt,
  revisionPrompt,
  systemPromptFor,
  taskPrompt,
  transcriptText,
  type ManifestEntry,
  type TranscriptEntry,
} from '@/lib/prompts';
import {
  basename,
  extractFiles,
  extractJson,
  isDocumentPath,
  languageFromPath,
  normalizePath,
  slugify,
  validatePlan,
  validateReview,
} from '@/lib/parse';
import { callGemini } from '@/lib/gemini-client';
import {
  clearCompanyData,
  clearLatestCompanyId,
  loadCompany,
  loadLatestCompanyId,
  saveCompanyMeta,
  saveDeliverable,
  saveMessage,
  setLatestCompanyId,
  type AppSettings,
} from '@/lib/storage';

export const BOARDROOM_ID = 'executive-boardroom';
const CHAIRMAN_ID = 'chairman';
const SYSTEM_ID = 'system';
const PALETTE = ['#34d399', '#f472b6', '#fbbf24', '#22d3ee', '#fb7185', '#a3e635', '#c084fc', '#60a5fa'];

export const EXECUTIVE_TEMPLATES: AgentRecord[] = [
  {
    id: 'ceo',
    kind: 'ceo',
    name: 'Alexandra Vance',
    title: 'Chief Executive Officer',
    department: 'Executive',
    specialty: 'Strategy, milestones and executive handover',
    status: 'idle',
    color: '#818cf8',
    hiredAt: 0,
  },
  {
    id: 'director',
    kind: 'director',
    name: 'Marcus Hale',
    title: 'Director of Engineering & Design',
    department: 'Executive',
    specialty: 'Architecture, UX specs and quality inspection',
    status: 'idle',
    color: '#a78bfa',
    hiredAt: 0,
  },
  {
    id: 'manager',
    kind: 'manager',
    name: 'Priya Nandi',
    title: 'Operations Manager',
    department: 'Executive',
    specialty: 'Task breakdown and staffing',
    status: 'idle',
    color: '#38bdf8',
    hiredAt: 0,
  },
];

export const BOARDROOM_ROOM: RoomRecord = {
  id: BOARDROOM_ID,
  kind: 'boardroom',
  name: BOARDROOM_ID,
  topic: 'Strategy, architecture, hiring and review',
};

export const deptRoomId = (department: string): string => `dept-${slugify(department)}`;
const keyOf = (agentId: string): string => (agentId.startsWith('emp-') ? agentId.slice(4) : agentId);
const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const assignmentText = (task: PlanTask, worker: AgentRecord): string =>
  `**${task.id} · ${task.title}**\n${task.description}\n\nOwner: ${worker.name} → ${task.deliverablePath}`;

interface Host {
  signal: AbortSignal;
  apiKey: string;
  model: AppSettings['model'];
  syncCompany: (snap: CompanySnapshot) => void;
  addMessage: (message: ChatMessage) => void;
  upsertDeliverable: (deliverable: Deliverable) => void;
}

function groupIssues(
  issues: ReviewIssue[],
  files: Map<string, Deliverable>,
  knownKeys: Set<string>,
): Map<string, ReviewIssue[]> {
  const grouped = new Map<string, ReviewIssue[]>();
  for (const issue of issues) {
    const file = files.get(normalizePath(issue.path));
    const owner = file ? keyOf(file.authorId) : '';
    const key = issue.assigneeKey && knownKeys.has(issue.assigneeKey) ? issue.assigneeKey : owner;
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), issue]);
  }
  return grouped;
}

async function runCompany(command: string, companyId: string, host: Host): Promise<string | null> {
  const snap: CompanySnapshot = {
    id: companyId,
    command,
    phase: 'boardroom',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agents: EXECUTIVE_TEMPLATES.map((a): AgentRecord => ({ ...a, status: 'idle', hiredAt: Date.now() })),
    rooms: [BOARDROOM_ROOM],
    plan: null,
    error: null,
  };
  const files = new Map<string, Deliverable>();
  const chat: ChatMessage[] = [];

  const commit = (): void => {
    snap.updatedAt = Date.now();
    host.syncCompany({
      ...snap,
      agents: snap.agents.map((a) => ({ ...a })),
      rooms: [...snap.rooms],
    });
  };

  const setPhase = (phase: CompanyPhase): void => {
    snap.phase = phase;
    commit();
  };

  const agentById = (id: string): AgentRecord | undefined => snap.agents.find((a) => a.id === id);
  const agentByKey = (key: string): AgentRecord | undefined => agentById(`emp-${key}`);

  const nameOf = (id: string): string => {
    if (id === CHAIRMAN_ID) return 'Chairman';
    if (id === SYSTEM_ID) return 'System';
    return agentById(id)?.name ?? 'Unknown';
  };

  const entriesFor = (roomId: string): TranscriptEntry[] =>
    chat
      .filter((m) => m.roomId === roomId)
      .map((m) => ({ author: nameOf(m.authorId), content: m.content }));

  const say = (roomId: string, authorId: string, kind: MessageKind, content: string): void => {
    const message: ChatMessage = {
      id: newId('msg'),
      companyId,
      roomId,
      authorId,
      kind,
      content,
      createdAt: Date.now(),
    };
    chat.push(message);
    host.addMessage(message);
  };

  const setStatus = (agentId: string, status: AgentStatus): void => {
    const agent = agentById(agentId);
    if (agent) {
      agent.status = status;
      commit();
    }
  };

  const ask = async (
    agent: AgentRecord,
    prompt: string,
    status: AgentStatus,
    roomId: string,
    json = false,
  ): Promise<string> => {
    if (host.signal.aborted) throw new Error('Stopped by Chairman.');
    setStatus(agent.id, status);
    try {
      const result = await callGemini({
        apiKey: host.apiKey,
        model: host.model,
        systemInstruction: systemPromptFor(agent),
        prompt,
        json,
        signal: host.signal,
      });
      if (result.finishReason && result.finishReason !== 'STOP' && result.finishReason !== 'MAX_TOKENS') {
        throw new Error(`The model stopped early (${result.finishReason}).`);
      }
      if (result.finishReason === 'MAX_TOKENS') {
        say(roomId, SYSTEM_ID, 'system', `⚠ ${agent.name}'s reply hit the token limit. Some content may be incomplete.`);
      }
      return result.text;
    } finally {
      setStatus(agent.id, 'idle');
    }
  };

  const askJson = async <T>(
    agent: AgentRecord,
    prompt: string,
    roomId: string,
    status: AgentStatus,
    parse: (raw: unknown) => T,
  ): Promise<T> => {
    const first = await ask(agent, prompt, status, roomId, true);
    try {
      return parse(extractJson(first));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'invalid JSON';
      const retry = await ask(
        agent,
        `${prompt}\n\nYour previous reply was rejected: ${reason}. Return ONLY a valid JSON object that matches the schema exactly.`,
        status,
        roomId,
        true,
      );
      return parse(extractJson(retry));
    }
  };

  const storeFile = (file: ParsedFile, authorId: string, roomId: string, taskId?: string): Deliverable => {
    const path = normalizePath(file.path);
    const existing = files.get(path);
    const now = Date.now();
    const next: Deliverable = existing
      ? {
          ...existing,
          content: file.content,
          language: file.language,
          authorId,
          roomId,
          version: existing.version + 1,
          updatedAt: now,
        }
      : {
          id: newId('dlv'),
          companyId,
          path,
          name: basename(path),
          language: file.language,
          kind: isDocumentPath(path) ? 'document' : 'code',
          content: file.content,
          authorId,
          roomId,
          taskId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
    files.set(path, next);
    host.upsertDeliverable(next);
    const lines = next.content.split('\n').length;
    say(
      roomId,
      SYSTEM_ID,
      'deliverable',
      `${existing ? 'Updated' : 'Delivered'} ${path} · v${next.version} · ${lines} lines`,
    );
    return next;
  };

  const manifestOf = (): ManifestEntry[] =>
    Array.from(files.values()).map((d) => ({ path: d.path, owner: keyOf(d.authorId), content: d.content }));

  try {
    const ceo = agentById('ceo') as AgentRecord;
    const director = agentById('director') as AgentRecord;
    const manager = agentById('manager') as AgentRecord;

    /* ----- 1. Executive boardroom ----- */
    say(BOARDROOM_ID, CHAIRMAN_ID, 'command', command);
    setPhase('boardroom');

    const ceoText = await ask(
      ceo,
      boardroomPrompt('strategy', command, transcriptText(entriesFor(BOARDROOM_ID))),
      'thinking',
      BOARDROOM_ID,
    );
    say(BOARDROOM_ID, ceo.id, 'speech', ceoText);

    const directorText = await ask(
      director,
      boardroomPrompt('architecture', command, transcriptText(entriesFor(BOARDROOM_ID))),
      'thinking',
      BOARDROOM_ID,
    );
    say(BOARDROOM_ID, director.id, 'speech', directorText);

    say(
      BOARDROOM_ID,
      manager.id,
      'speech',
      await ask(
        manager,
        boardroomPrompt('breakdown', command, transcriptText(entriesFor(BOARDROOM_ID))),
        'thinking',
        BOARDROOM_ID,
      ),
    );

    /* ----- 2. Hiring ----- */
    setPhase('hiring');
    const plan: ProjectPlan = await askJson(
      manager,
      hiringPrompt(command, transcriptText(entriesFor(BOARDROOM_ID))),
      BOARDROOM_ID,
      'thinking',
      validatePlan,
    );
    snap.plan = plan;

    plan.roster.forEach((entry, index) => {
      snap.agents.push({
        id: `emp-${entry.key}`,
        kind: 'employee',
        name: entry.name,
        title: entry.title,
        department: entry.department,
        specialty: entry.specialty,
        status: 'idle',
        color: PALETTE[index % PALETTE.length],
        hiredAt: Date.now(),
      });
      const roomId = deptRoomId(entry.department);
      if (!snap.rooms.some((r) => r.id === roomId)) {
        snap.rooms.push({
          id: roomId,
          kind: 'department',
          name: roomId,
          topic: `${entry.department} working room`,
          department: entry.department,
        });
      }
      say(BOARDROOM_ID, manager.id, 'system', `Hired ${entry.name}, ${entry.title} (${entry.department}).`);
    });
    commit();

    /* ----- 3. Department breakout ----- */
    setPhase('department');
    const briefing = `CEO strategy:\n${clip(ceoText, 3500)}\n\nDirector architecture:\n${clip(directorText, 4500)}`;

    for (const task of plan.tasks) {
      const worker = agentByKey(task.assigneeKey);
      if (!worker) throw new Error(`No employee found for ${task.assigneeKey}.`);
      const roomId = deptRoomId(worker.department);

      say(roomId, manager.id, 'speech', assignmentText(task, worker));

      const reply = await ask(
        worker,
        taskPrompt({
          command,
          projectName: plan.projectName,
          summary: plan.summary,
          briefing,
          roomTranscript: transcriptText(entriesFor(roomId), 5000),
          taskId: task.id,
          taskTitle: task.title,
          taskDescription: task.description,
          deliverablePath: task.deliverablePath,
          manifest: manifestOf(),
        }),
        'coding',
        roomId,
      );
      say(roomId, worker.id, 'speech', reply);

      const parsed = extractFiles(reply);
      if (parsed.length === 0) {
        say(roomId, SYSTEM_ID, 'system', `No fenced file found in the reply. Stored the full reply as ${task.deliverablePath}.`);
      }
      const produced: ParsedFile[] =
        parsed.length > 0
          ? parsed
          : [{ path: task.deliverablePath, language: languageFromPath(task.deliverablePath), content: reply.trim() }];
      for (const file of produced) storeFile(file, worker.id, roomId, task.id);
    }

    /* ----- 4. Inspection ----- */
    setPhase('inspection');
    const verdict = await askJson(
      director,
      reviewPrompt({
        command,
        projectName: plan.projectName,
        summary: plan.summary,
        manifest: manifestOf(),
      }),
      BOARDROOM_ID,
      'reviewing',
      validateReview,
    );
    say(
      BOARDROOM_ID,
      director.id,
      'speech',
      `**Review: ${verdict.approved ? 'APPROVED' : 'CHANGES REQUESTED'}**\n\n${verdict.message}`,
    );

    /* ----- 5. Targeted revisions (one pass, max three employees) ----- */
    if (!verdict.approved && verdict.issues.length > 0) {
      setPhase('revision');
      const knownKeys = new Set(plan.roster.map((r) => r.key));
      const grouped = groupIssues(verdict.issues, files, knownKeys);

      for (const [key, issues] of Array.from(grouped.entries()).slice(0, 3)) {
        const worker = agentByKey(key);
        if (!worker) continue;
        const roomId = deptRoomId(worker.department);
        const targets: ManifestEntry[] = Array.from(new Set(issues.map((i) => normalizePath(i.path))))
          .map((p) => files.get(p))
          .filter((d): d is Deliverable => Boolean(d))
          .map((d) => ({ path: d.path, owner: keyOf(d.authorId), content: d.content }));
        if (targets.length === 0) continue;

        say(
          roomId,
          director.id,
          'speech',
          `Revision requested from ${worker.name}:\n${issues.map((i) => `- ${i.path}: ${i.problem}`).join('\n')}`,
        );
        const reply = await ask(
          worker,
          revisionPrompt({ command, issues, files: targets }),
          'coding',
          roomId,
        );
        say(roomId, worker.id, 'speech', reply);
        for (const file of extractFiles(reply)) storeFile(file, worker.id, roomId);
      }
    }

    /* ----- 6. CEO executive handover ----- */
    setPhase('handover');
    const handover = await ask(
      ceo,
      handoverPrompt({
        command,
        summary: plan.summary,
        paths: Array.from(files.keys()),
        verdict: verdict.message,
      }),
      'thinking',
      BOARDROOM_ID,
    );
    say(BOARDROOM_ID, ceo.id, 'handover', handover);
    storeFile({ path: 'HANDOVER.md', language: 'markdown', content: handover.trim() }, ceo.id, BOARDROOM_ID);

    /* ----- 7. Complete ----- */
    say(BOARDROOM_ID, SYSTEM_ID, 'system', `✅ Simulation complete. ${files.size} deliverable(s) are ready in the vault.`);
    setPhase('complete');
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    if (host.signal.aborted) {
      say(BOARDROOM_ID, SYSTEM_ID, 'system', '⏹ Stopped by the Chairman.');
      snap.phase = 'stopped';
      return null;
    }
    snap.phase = 'error';
    snap.error = message;
    say(BOARDROOM_ID, SYSTEM_ID, 'system', `❌ ${message}`);
    return message;
  } finally {
    snap.agents.forEach((a) => {
      a.status = 'idle';
    });
    commit();
  }
}

export function useCompanyEngine(settings: AppSettings) {
  const [company, setCompany] = useState<CompanySnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>(BOARDROOM_ID);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Restore the last company on mount. A run that was interrupted by a reload is shown as stopped.
  useEffect(() => {
    let cancelled = false;
    const id = loadLatestCompanyId();
    if (!id) return;
    loadCompany(id)
      .then((loaded) => {
        if (cancelled || !loaded) return;
        const terminal = ['complete', 'stopped', 'error'].includes(loaded.company.phase);
        setCompany(terminal ? loaded.company : { ...loaded.company, phase: 'stopped' });
        setMessages(loaded.messages);
        setDeliverables(loaded.deliverables);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const reportError = useCallback((error: unknown) => {
    setNotice(error instanceof Error ? error.message : 'Storage error.');
  }, []);

  const start = useCallback(
    (raw: string) => {
      const command = raw.trim();
      if (!command || controllerRef.current) return;

      const { apiKey, model } = settingsRef.current;
      if (!apiKey.trim()) {
        setNotice('Add your Gemini API key in Settings before convening the company.');
        return;
      }

      const controller = new AbortController();
      const companyId = newId('co');
      const session = ++sessionRef.current;
      const live = () => sessionRef.current === session;

      controllerRef.current = controller;
      setCompany(null);
      setMessages([]);
      setDeliverables([]);
      setActiveRoomId(BOARDROOM_ID);
      setNotice(null);
      setRunning(true);
      setLatestCompanyId(companyId);

      const host: Host = {
        signal: controller.signal,
        apiKey: apiKey.trim(),
        model,
        syncCompany: (snap) => {
          if (!live()) return;
          setCompany(snap);
          saveCompanyMeta(snap).catch(reportError);
        },
        addMessage: (message) => {
          if (!live()) return;
          setMessages((prev) => [...prev, message]);
          saveMessage(message).catch(reportError);
        },
        upsertDeliverable: (deliverable) => {
          if (!live()) return;
          setDeliverables((prev) => {
            const index = prev.findIndex((d) => d.id === deliverable.id);
            if (index === -1) return [...prev, deliverable];
            const next = [...prev];
            next[index] = deliverable;
            return next;
          });
          saveDeliverable(deliverable).catch(reportError);
        },
      };

      runCompany(command, companyId, host)
        .then((error) => {
          if (live() && error) setNotice(error);
        })
        .finally(() => {
          if (live()) {
            controllerRef.current = null;
            setRunning(false);
          }
        });
    },
    [reportError],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(async () => {
    sessionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRunning(false);

    const id = loadLatestCompanyId();
    clearLatestCompanyId();
    setCompany(null);
    setMessages([]);
    setDeliverables([]);
    setActiveRoomId(BOARDROOM_ID);
    setNotice(null);

    if (id) {
      await clearCompanyData(id).catch(reportError);
    }
  }, [reportError]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    company,
    agents: company?.agents ?? EXECUTIVE_TEMPLATES,
    rooms: company?.rooms ?? [BOARDROOM_ROOM],
    messages,
    deliverables,
    activeRoomId,
    setActiveRoomId,
    running,
    notice,
    dismissNotice,
    start,
    stop,
    reset,
  };
}
