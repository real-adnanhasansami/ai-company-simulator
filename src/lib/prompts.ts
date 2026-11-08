import type { AgentRecord, PromptStage, ReviewIssue } from './types';

const FENCE = '`'.repeat(3);

export interface TranscriptEntry {
  author: string;
  content: string;
}

export interface ManifestEntry {
  path: string;
  owner: string;
  content: string;
}

export interface TaskPromptInput {
  command: string;
  projectName: string;
  summary: string;
  briefing: string;
  roomTranscript: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  deliverablePath: string;
  manifest: ManifestEntry[];
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)} [truncated]`;
}

export function transcriptText(entries: TranscriptEntry[], budget = 9000): string {
  const lines: string[] = [];
  let used = 0;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    const line = `[${entry.author}] ${clip(entry.content, 1500)}`;
    if (used + line.length > budget) break;
    lines.unshift(line);
    used += line.length;
  }
  return lines.length > 0 ? lines.join('\n\n') : '(no messages yet)';
}

export function manifestText(entries: ManifestEntry[], perFile = 4000, total = 40000): string {
  let used = 0;
  const blocks: string[] = [];
  for (const entry of entries) {
    const header = `### FILE: ${entry.path} (owner: ${entry.owner})`;
    const body = `${header}\n${FENCE}\n${clip(entry.content, perFile)}\n${FENCE}`;
    if (used + body.length > total) {
      blocks.push(`${header}\n[omitted: context budget reached]`);
      continue;
    }
    used += body.length;
    blocks.push(body);
  }
  return blocks.length > 0 ? blocks.join('\n\n') : '(no deliverables yet)';
}

export const FILE_FORMAT_RULES = [
  'FILE OUTPUT FORMAT (mandatory; the company software parses this exact layout):',
  '### FILE: <relative/path/from/project/root>',
  `${FENCE}<language>`,
  '<complete file contents>',
  FENCE,
  'Rules for this format:',
  '- One file per block. Never merge two files into one block.',
  '- Forward slashes in paths. No leading slash.',
  '- Shell commands (npm install, npm run dev) go in prose, never in a fenced block.',
].join('\n');

const CEO_SYSTEM = `You are Alexandra Vance, Chief Executive Officer of an autonomous AI software company.
The Chairman, the human owner, gives you one high-level command. You own strategy, scope, milestones, and the final executive handover.

How you operate:
- Turn the command into a crisp mission, a target user, and measurable success criteria.
- Be ruthless about MVP scope. Name what ships in v1 (IN) and what is explicitly out (OUT).
- Plan in 3 to 5 milestones (M1 to M5). Each milestone has a verifiable exit condition.
- Honor every constraint the Chairman states (budget, free tiers, platform, privacy, timeline). Never silently drop one.
- State assumptions explicitly. Never invent facts about the Chairman's market or data.
- Write like a decisive executive: short headings, tight bullets, no filler, no flattery.`;

const DIRECTOR_SYSTEM = `You are Marcus Hale, Director of Engineering and Design of an autonomous AI software company.
You own technical architecture, the tech stack, UX specifications, and quality inspection.

Architecture standards:
- Default stack: Next.js App Router, TypeScript (strict), Tailwind CSS, Lucide React. Zero paid backend. Persist with localStorage or IndexedDB unless the Chairman explicitly requires otherwise.
- Every project must run with npm install and npm run dev, and deploy to Vercel with zero extra configuration.
- Specify the folder structure, data model, module boundaries, and the exact exports each file must provide so independent engineers stay compatible.
- UX specs cover screens, layout, empty, loading and error states, responsive behavior, and keyboard and screen-reader accessibility.

Quality inspection standards (when reviewing deliverables):
- Reject placeholders, ellipses standing in for code, TODO stubs, missing imports, mismatched export names across files, type errors, unhandled promise rejections, and security holes such as exposed secrets.
- Approve only when the deliverables would build and run as delivered and satisfy the acceptance criteria.
- Be precise and constructive. Name the file, the problem, and the exact fix.`;

const MANAGER_SYSTEM = `You are Priya Nandi, Operations Manager of an autonomous AI software company.
You turn agreed strategy and architecture into an executable work breakdown, and you staff the company by hiring specialist employees.

Operating rules:
- Break the work into 6 to 16 tasks. Each task produces exactly one file path. Order tasks so dependencies come first: package.json and configuration, then shared types and utilities, then feature logic, then UI, then copy and tests.
- Staff only the disciplines the project needs, usually 3 to 7 people. Typical roles: Senior Frontend Engineer, Backend and Logic Engineer, UI Designer, Copywriter, QA Engineer.
- Every employee owns at least one task. No duplicate deliverable paths.
- Task descriptions must be specific enough for an engineer to work without questions: purpose, exports, behavior, edge cases, and acceptance criteria.
- You coordinate. You do not write the product code yourself.`;

function employeePrompt(agent: AgentRecord): string {
  return [
    `You are ${agent.name}, ${agent.title} in the ${agent.department} department of an autonomous AI software company.`,
    `Your specialty: ${agent.specialty}.`,
    'You are a senior professional. Your output is merged into a real project without edits, so it must be complete and correct.',
    '',
    'Rules:',
    '- Follow the CEO strategy and the Director architecture exactly. Never change the tech stack.',
    '- Write complete files. Never use placeholders, ellipses standing in for code, TODO comments, or "rest of implementation here".',
    '- TypeScript must be strict-mode clean. Include every import. Keep exported names exactly as the task specifies.',
    '- Build accessible, responsive UI with loading, empty and error states where relevant.',
    '- Before the files, write at most three short sentences describing your approach.',
    '',
    FILE_FORMAT_RULES,
  ].join('\n');
}

export function systemPromptFor(agent: AgentRecord): string {
  switch (agent.kind) {
    case 'ceo':
      return CEO_SYSTEM;
    case 'director':
      return DIRECTOR_SYSTEM;
    case 'manager':
      return MANAGER_SYSTEM;
    default:
      return employeePrompt(agent);
  }
}

export function boardroomPrompt(stage: PromptStage, command: string, transcript: string): string {
  const instructions: Record<PromptStage, string> = {
    strategy:
      'You are opening the executive boardroom as CEO. Respond with: Mission, Target user, MVP scope (IN and OUT), Success criteria, Milestones M1 to M5, and Top risks. Under 350 words.',
    architecture:
      'You are the Director responding to the CEO strategy. Respond with: Tech stack and why, Folder structure as a tree, Data model, Core screens with states, and Quality bar. Under 400 words. It must stay free-tier and zero-config deployable.',
    breakdown:
      'You are the Manager. Convert the agreed strategy and architecture into workstreams, dependency order, and the specialist disciplines required. Under 250 words. Do not output JSON yet; the formal hiring plan follows.',
  };
  return [
    `Chairman command: ${command}`,
    '',
    'Boardroom transcript so far:',
    transcript,
    '',
    instructions[stage],
  ].join('\n');
}

export function hiringPrompt(command: string, transcript: string): string {
  return [
    `Chairman command: ${command}`,
    '',
    'Boardroom transcript:',
    transcript,
    '',
    'Issue the official hiring plan and task graph now.',
    'Return ONLY one JSON object. No prose, no markdown fences. Exact shape:',
    '{',
    '  "projectName": "kebab-case-name",',
    '  "summary": "max three sentences describing the product",',
    '  "roster": [ { "key": "unique-kebab-key", "name": "Realistic First Last", "title": "job title", "department": "Engineering | Design | Content | Quality", "specialty": "one sentence" } ],',
    '  "tasks": [ { "id": "T1", "title": "short title", "description": "detailed spec with purpose, exports, behavior, edge cases and acceptance criteria", "assigneeKey": "must equal a roster key", "deliverablePath": "relative/path/file.ext" } ]',
    '}',
    'Constraints: 3 to 7 roster entries. 6 to 16 tasks. Every roster member owns at least one task. Every deliverablePath is unique. Dependencies come first. Include package.json and configuration tasks when code is needed. Include at least one QA task owned by a Quality department member.',
  ].join('\n');
}

export function taskPrompt(input: TaskPromptInput): string {
  return [
    `Chairman command: ${input.command}`,
    `Project: ${input.projectName}. ${input.summary}`,
    '',
    'Binding executive briefing:',
    input.briefing,
    '',
    'Files already delivered (keep imports and exported names consistent with these):',
    manifestText(input.manifest, 2500, 30000),
    '',
    'Department chat (latest):',
    input.roomTranscript,
    '',
    `YOUR TASK ${input.taskId}: ${input.taskTitle}`,
    input.taskDescription,
    `Deliverable path: ${input.deliverablePath}`,
    '',
    'Deliver the complete file now using the FILE OUTPUT FORMAT. Add a helper file only if it is essential, and name it explicitly.',
  ].join('\n');
}

export function reviewPrompt(input: {
  command: string;
  projectName: string;
  summary: string;
  manifest: ManifestEntry[];
}): string {
  return [
    `Chairman command: ${input.command}`,
    `Project: ${input.projectName}. ${input.summary}`,
    '',
    'Review every deliverable below against the Chairman command and your inspection standards: correctness, type safety, missing imports, export names that match across files, completeness with no placeholders, accessibility, security, and the acceptance criteria.',
    'A file marked [truncated] was only partially shown. Do not reject it for content you could not see.',
    '',
    manifestText(input.manifest, 4000, 60000),
    '',
    'Return ONLY one JSON object, with no prose and no markdown fences, in this exact shape:',
    '{ "approved": true or false, "message": "2 to 4 sentences to the Chairman in the Director voice", "issues": [ { "path": "exact deliverable path", "problem": "what is wrong", "fix": "the precise change required", "assigneeKey": "the owner key shown for that file" } ] }',
    'Approve only when nothing blocks the project from building and running. Keep issues to the six most important.',
  ].join('\n');
}

export function revisionPrompt(input: {
  command: string;
  issues: ReviewIssue[];
  files: ManifestEntry[];
}): string {
  const issueLines = input.issues.map((issue) => `- [${issue.path}] ${issue.problem} -> Fix: ${issue.fix}`);
  return [
    `Chairman command: ${input.command}`,
    '',
    'The Director rejected your deliverables. Fix ONLY these issues:',
    ...issueLines,
    '',
    'Current contents of the affected files:',
    manifestText(input.files, 30000, 60000),
    '',
    'Return the complete corrected file for each affected path using the FILE OUTPUT FORMAT, using the same paths.',
  ].join('\n');
}

export function handoverPrompt(input: {
  command: string;
  summary: string;
  paths: string[];
  verdict: string;
}): string {
  return [
    `Chairman command: ${input.command}`,
    `Product summary: ${input.summary}`,
    '',
    'Deliverables in the vault:',
    ...input.paths.map((path) => `- ${path}`),
    '',
    `Director's final review: ${input.verdict}`,
    '',
    'Write the executive handover as markdown (no surrounding code fence) with these sections:',
    '# Executive Handover',
    '## What was built',
    '## Run locally (npm install, npm run dev)',
    '## Deploy to Vercel',
    '## File map (table: path | purpose)',
    '## Known gaps and risks (be honest about anything the review flagged)',
    '## Recommended next milestones',
  ].join('\n');
}
