import { TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
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

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { SessionExpiry } from "./SessionExpiry";

type Props = {
  session: TAgentVaultMintedSession | null;
  onOpenChange: (isOpen: boolean) => void;
};

const runCommand = (token: string) =>
  `infisical agent-vault run \\
  --session-token ${token} \\
  --proxy <proxy-host>:17323 \\
  -- <agent-command>`;

export const SessionCreatedDialog = ({ session, onOpenChange }: Props) => (
  <Dialog open={Boolean(session)} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl" onInteractOutside={(event) => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Session Created</DialogTitle>
        <DialogDescription>
          Run this where your agent runs. Its traffic reaches the proxy with the credentials this
          session carries.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            This command is shown once. Copy it now, the session token cannot be retrieved later.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-2">
          <CodeBlock label="Run an agent with it" value={runCommand(session?.token ?? "")} />
          <p className="text-xs text-accent">
            Replace <span className="font-mono">&lt;proxy-host&gt;</span> with the host your proxy
            runs on and <span className="font-mono">&lt;agent-command&gt;</span> with the agent to
            run, such as <span className="font-mono">claude</span>.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-accent">Expires</span>
          <SessionExpiry expiresAt={session?.expiresAt ?? null} />
        </div>

        <p className="mt-2 text-xs text-accent">
          Learn how to{" "}
          <a
            href={AgentVaultDocsUrls.sessions}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            create a session using the CLI or a machine identity
          </a>
          .
        </p>
      </div>

      <DialogFooter>
        <Button variant="av" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
