import {
  Button,
  CodeBlock,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { TAgentVaultMintedSession } from "@app/hooks/api/agentVault/types";

import { SessionExpiry } from "./SessionExpiry";

type Props = {
  session: TAgentVaultMintedSession | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const SessionCreatedDialog = ({ session, onOpenChange }: Props) => (
  <Dialog open={Boolean(session)} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Session Created</DialogTitle>
        <DialogDescription>This command is shown once. Copy it now.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <CodeBlock
          label="Run an agent with it"
          value={`infisical av run --token ${session?.token ?? ""} --proxy <proxy-address> -- <agent-command>`}
        />
        <p className="text-xs text-accent">
          The proxy address differs per network. Ask whoever runs the proxy. Anything after{" "}
          <span className="font-mono">--</span> runs with the session, for example{" "}
          <span className="font-mono">claude</span> or{" "}
          <span className="font-mono">python agent.py</span>.
        </p>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-accent">Expires</span>
          <SessionExpiry expiresAt={session?.expiresAt ?? null} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="av" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
