import { formatDistanceToNowStrict } from "date-fns";
import { InfinityIcon } from "lucide-react";

import {
  Badge,
  Button,
  CodeBlock,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession
} from "@app/hooks/api/agentVault/types";

type Props = {
  session: TAgentVaultMintedSession | null;
  accessBundles: TAgentVaultAccessBundleListItem[];
  onOpenChange: (isOpen: boolean) => void;
};

export const SessionCreatedDialog = ({ session, accessBundles, onOpenChange }: Props) => {
  const reachableHosts = [
    ...new Set(accessBundles.flatMap((bundle) => bundle.hostPatterns))
  ].sort();

  return (
    <Dialog open={Boolean(session)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Session Created</DialogTitle>
          <DialogDescription>This token is shown once. Copy it now.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <CodeBlock value={session?.token ?? ""} label="Session token" />
          <CodeBlock
            label="Run an agent with it"
            value={`infisical av run --token ${session?.token ?? ""} --proxy <proxy-address> -- claude`}
          />
          <p className="text-xs text-accent">
            The proxy address differs per network. Ask whoever runs the proxy. Fingerprints for
            pinning are on the Proxies page.
          </p>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-accent">Expires</span>
            {session?.expiresAt ? (
              <span className="text-sm">
                in {formatDistanceToNowStrict(new Date(session.expiresAt))}
              </span>
            ) : (
              <Badge variant="warning" className="self-start">
                <InfinityIcon />
                Never
              </Badge>
            )}
          </div>

          {reachableHosts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-accent">Reachable</span>
              <div className="flex flex-wrap gap-1.5">
                {reachableHosts.map((host) => (
                  <span
                    key={host}
                    className="rounded border border-border bg-container px-1.5 py-0.5 font-mono text-xs"
                  >
                    {host}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="av" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
