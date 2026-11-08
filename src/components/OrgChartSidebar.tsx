'use client';

import type { ReactNode } from 'react';
import { Bot, ClipboardList, Crown, Hash, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import type { AgentRecord, AgentStatus, RoomRecord } from '@/lib/types';
import { deptRoomId } from '@/hooks/useCompanyEngine';

interface OrgChartSidebarProps {
  agents: AgentRecord[];
  rooms: RoomRecord[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
}

const STATUS: Record<AgentStatus, { label: string; dot: string; text: string }> = {
  idle: { label: 'Idle', dot: 'bg-zinc-500', text: 'text-zinc-500' },
  thinking: { label: 'Thinking', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300' },
  coding: { label: 'Coding', dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-300' },
  reviewing: { label: 'Reviewing', dot: 'bg-indigo-400 animate-pulse', text: 'text-indigo-300' },
  error: { label: 'Error', dot: 'bg-rose-500', text: 'text-rose-300' },
};

const EXEC_ICON: Record<'ceo' | 'director' | 'manager', LucideIcon> = {
  ceo: Crown,
  director: ShieldCheck,
  manager: ClipboardList,
};

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function AgentRow({ agent, onClick }: { agent: AgentRecord; onClick?: () => void }) {
  const status = STATUS[agent.status];
  const Icon: LucideIcon = agent.kind === 'employee' ? Bot : EXEC_ICON[agent.kind];
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-zinc-900 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-950"
          style={{ backgroundColor: agent.color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-100">{agent.name}</span>
          <span className="block truncate text-xs text-zinc-500">{agent.title}</span>
        </span>
        <span className={`flex shrink-0 items-center gap-1.5 text-[11px] ${status.text}`}>
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </button>
    </li>
  );
}

export default function OrgChartSidebar({ agents, rooms, activeRoomId, onSelectRoom }: OrgChartSidebarProps) {
  const executives = agents.filter((a) => a.kind !== 'employee');
  const staff = agents.filter((a) => a.kind === 'employee');
  const departments = Array.from(new Set(staff.map((a) => a.department)));
  const roomIds = new Set(rooms.map((r) => r.id));

  return (
    <nav aria-label="Organization" className="flex flex-col gap-6 p-4">
      <Section title="Executive board" icon={<Crown className="h-3.5 w-3.5" />}>
        <ul className="space-y-1">
          {executives.map((agent) => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </ul>
      </Section>

      <Section title="Staff" icon={<Users className="h-3.5 w-3.5" />}>
        {staff.length === 0 ? (
          <p className="px-2.5 text-xs text-zinc-600">No employees hired yet.</p>
        ) : (
          departments.map((department) => {
            const roomId = deptRoomId(department);
            const canOpen = roomIds.has(roomId);
            return (
              <div key={department} className="mb-3">
                <p className="px-2.5 pb-1 text-xs font-medium text-zinc-400">{department}</p>
                <ul className="space-y-1">
                  {staff
                    .filter((a) => a.department === department)
                    .map((agent) => (
                      <AgentRow
                        key={agent.id}
                        agent={agent}
                        onClick={canOpen ? () => onSelectRoom(roomId) : undefined}
                      />
                    ))}
                </ul>
              </div>
            );
          })
        )}
      </Section>

      <Section title="Meeting rooms" icon={<Hash className="h-3.5 w-3.5" />}>
        <ul className="space-y-1">
          {rooms.map((room) => {
            const active = room.id === activeRoomId;
            return (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => onSelectRoom(room.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/30'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <Hash className="h-4 w-4 shrink-0" />
                  <span className="truncate">{room.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </nav>
  );
}
