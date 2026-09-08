import { ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  CodeBlock,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useTimeRemaining } from "@app/hooks";
import { TAgentVaultEnrollment } from "@app/hooks/api/agentVault/types";

const cliCommand = (token: string, siteUrl: string) =>
  `infisical av proxy \\
  --enrollment-token ${token} \\
  --domain ${siteUrl}`;

const dockerCommand = (token: string, siteUrl: string) =>
  `docker run -d --name agent-vault-proxy \\
  -p 17323:17323 \\
  -v agent-vault-proxy:/etc/infisical/agent-vault \\
  infisical/cli av proxy \\
  --enrollment-token ${token} \\
  --domain ${siteUrl}`;

const systemdUnit = (token: string, siteUrl: string) =>
  `[Unit]
Description=Infisical Agent Vault proxy
After=network-online.target

[Service]
ExecStart=/usr/local/bin/infisical av proxy --enrollment-token ${token} --domain ${siteUrl}
Restart=always

[Install]
WantedBy=multi-user.target`;

type Props = {
  enrollment: TAgentVaultEnrollment | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ProxyEnrollmentDialog = ({ enrollment, onOpenChange }: Props) => {
  const token = enrollment?.token ?? "";
  const { protocol, hostname, port } = window.location;
  const siteUrl = `${protocol}//${hostname}${port && port !== "80" ? `:${port}` : ""}`;
  const { label: expiryLabel, isExpired } = useTimeRemaining(enrollment?.expiresAt);

  const labelWithExpiry = (text: string): ReactNode => (
    <span className="flex w-full items-center justify-between gap-2">
      <span>{text}</span>
      <Badge className="tabular-nums" variant={isExpired ? "danger" : "neutral"}>
        {expiryLabel}
      </Badge>
    </span>
  );

  return (
    <Dialog open={Boolean(enrollment)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Enrollment Token</DialogTitle>
          <DialogDescription>
            Run this where the proxy lives. It enrolls once and keeps its own certificate after
            that.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              {isExpired
                ? "This token has expired. Generate a new one from the proxy's menu."
                : "This token is shown once and expires in an hour. Copy it now, it cannot be retrieved later."}
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="cli">
            <TabsList variant="av" aria-label="Deployment target">
              <TabsTrigger value="cli">CLI</TabsTrigger>
              <TabsTrigger value="docker">Docker</TabsTrigger>
              <TabsTrigger value="systemd">systemd</TabsTrigger>
            </TabsList>
            <TabsContent value="cli">
              <CodeBlock
                value={cliCommand(token, siteUrl)}
                label={labelWithExpiry("Command")}
                isCopyable={!isExpired}
              />
            </TabsContent>
            <TabsContent value="docker">
              <CodeBlock
                value={dockerCommand(token, siteUrl)}
                label={labelWithExpiry("Command")}
                isCopyable={!isExpired}
              />
            </TabsContent>
            <TabsContent value="systemd">
              <CodeBlock
                value={systemdUnit(token, siteUrl)}
                label={labelWithExpiry("Unit file")}
                isCopyable={!isExpired}
              />
            </TabsContent>
          </Tabs>
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
