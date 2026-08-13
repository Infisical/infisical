import { SandboxStatus, TSandbox } from "@app/hooks/api/sandboxes";

import { SandboxFileBrowser } from "./SandboxFileBrowser";
import { SandboxTerminal } from "./SandboxTerminal";

/**
 * Two cards, each holding its tool and nothing else.
 *
 * No titles and no status badges: the tab is already called Terminal, the tree shows its own path,
 * and the sandbox's running state is in the page header a few pixels above. Every one of those was
 * repeating something already on screen and costing a row of height to do it.
 */
export const TerminalTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const isRunning = sandbox.status === SandboxStatus.Running;

  return (
    // min-w-0 on both tracks, or the terminal canvas widens its own column and squeezes the tree.
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
      <div className="min-w-0 rounded-lg border border-border bg-card p-3">
        <SandboxFileBrowser sandboxId={sandbox.id} isRunning={isRunning} />
      </div>

      <div className="min-w-0 rounded-lg border border-border bg-card p-3">
        <SandboxTerminal sandboxId={sandbox.id} sandboxName={sandbox.name} isRunning={isRunning} />
      </div>
    </div>
  );
};
