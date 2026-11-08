'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import TopBar from '@/components/TopBar';
import OrgChartSidebar from '@/components/OrgChartSidebar';
import ChatFeed from '@/components/ChatFeed';
import DeliverableVault from '@/components/DeliverableVault';
import SettingsModal from '@/components/SettingsModal';
import { BOARDROOM_ID, useCompanyEngine } from '@/hooks/useCompanyEngine';
import { useSettings } from '@/hooks/useSettings';

export default function Home() {
  const { settings, updateSettings } = useSettings();
  const engine = useCompanyEngine(settings);
  const [command, setCommand] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(null);

  const activeRoom = engine.rooms.find((room) => room.id === engine.activeRoomId) ?? engine.rooms[0];
  const phase = engine.company?.phase ?? null;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <TopBar
        command={command}
        onCommandChange={setCommand}
        onStart={() => engine.start(command)}
        onStop={engine.stop}
        onReset={() => {
          void engine.reset();
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        running={engine.running}
        phase={phase}
        hasApiKey={settings.apiKey.trim().length > 0}
      />

      {engine.notice && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
        >
          <span>{engine.notice}</span>
          <button
            type="button"
            onClick={engine.dismissNotice}
            aria-label="Dismiss notice"
            className="rounded p-1 text-amber-300 transition hover:bg-amber-500/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <aside className="w-full shrink-0 border-b border-zinc-800 bg-zinc-950 lg:w-72 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <OrgChartSidebar
            agents={engine.agents}
            rooms={engine.rooms}
            activeRoomId={activeRoom?.id ?? BOARDROOM_ID}
            onSelectRoom={engine.setActiveRoomId}
          />
        </aside>

        <div className="flex min-h-[60vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <ChatFeed
            room={activeRoom}
            messages={engine.messages}
            agents={engine.agents}
            phase={phase}
            running={engine.running}
          />
        </div>

        <div className="flex min-h-[60vh] w-full shrink-0 flex-col border-t border-zinc-800 lg:min-h-0 lg:w-[26rem] lg:border-l lg:border-t-0">
          <DeliverableVault
            deliverables={engine.deliverables}
            selectedId={selectedDeliverableId}
            onSelect={setSelectedDeliverableId}
          />
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onSave={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
