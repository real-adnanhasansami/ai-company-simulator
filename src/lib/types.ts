export type AgentKind = 'ceo' | 'director' | 'manager' | 'employee';
export type AgentStatus = 'idle' | 'thinking' | 'coding' | 'reviewing' | 'error';
export type CompanyPhase =
  | 'boardroom'
  | 'hiring'
  | 'department'
  | 'inspection'
  | 'revision'
  | 'handover'
  | 'complete'
  | 'stopped'
  | 'error';
export type RoomKind = 'boardroom' | 'department';
export type MessageKind = 'command' | 'speech' | 'system' | 'deliverable' | 'handover';
export type DeliverableKind = 'code' | 'document';
export type ModelId = 'gemini-3.8-flash' | 'gemini-3.1-pro-preview';
export type PromptStage = 'strategy' | 'architecture' | 'breakdown';

export interface AgentRecord {
  id: string;
  kind: AgentKind;
  name: string;
  title: string;
  department: string;
  specialty: string;
  status: AgentStatus;
  color: string;
  hiredAt: number;
}

export interface RoomRecord {
  id: string;
  kind: RoomKind;
  name: string;
  topic: string;
  department?: string;
}

export interface ChatMessage {
  id: string;
  companyId: string;
  roomId: string;
  authorId: string;
  kind: MessageKind;
  content: string;
  createdAt: number;
}

export interface Deliverable {
  id: string;
  companyId: string;
  path: string;
  name: string;
  language: string;
  kind: DeliverableKind;
  content: string;
  authorId: string;
  roomId: string;
  taskId?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlanRosterEntry {
  key: string;
  name: string;
  title: string;
  department: string;
  specialty: string;
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  assigneeKey: string;
  deliverablePath: string;
}

export interface ProjectPlan {
  projectName: string;
  summary: string;
  roster: PlanRosterEntry[];
  tasks: PlanTask[];
}

export interface ReviewIssue {
  path: string;
  problem: string;
  fix: string;
  assigneeKey: string;
}

export interface ReviewVerdict {
  approved: boolean;
  message: string;
  issues: ReviewIssue[];
}

export interface CompanySnapshot {
  id: string;
  command: string;
  phase: CompanyPhase;
  createdAt: number;
  updatedAt: number;
  agents: AgentRecord[];
  rooms: RoomRecord[];
  plan: ProjectPlan | null;
  error: string | null;
}

export interface ParsedFile {
  path: string;
  language: string;
  content: string;
}

export interface GeminiResult {
  text: string;
  finishReason: string | null;
}
