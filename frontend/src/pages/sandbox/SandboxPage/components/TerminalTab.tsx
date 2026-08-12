import { SandboxStatus, TSandbox } from "@app/hooks/api/sandboxes";

import { SandboxTerminal } from "./SandboxTerminal";

export const TerminalTab = ({ sandbox }: { sandbox: TSandbox }) => (
  <SandboxTerminal
    sandboxId={sandbox.id}
    sandboxName={sandbox.name}
    isRunning={sandbox.status === SandboxStatus.Running}
  />
);
