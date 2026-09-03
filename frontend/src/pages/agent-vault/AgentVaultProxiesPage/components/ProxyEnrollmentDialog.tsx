import {
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
import { TAgentVaultEnrollment } from "@app/hooks/api/agentVault/types";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

const cliCommand = (token: string, siteUrl: string) =>
  `infisical av proxy \\
  --enrollment-token ${token} \\
  --domain ${siteUrl}`;

const dockerCommand = (token: string, siteUrl: string) =>
  `docker run -d --name agent-vault-proxy \\
  -p 17323:17323 \\
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

  return (
    <Dialog open={Boolean(enrollment)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enrollment Token</DialogTitle>
          <DialogDescription>
            This token is shown only once and expires in an hour.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Tabs defaultValue="cli">
            <TabsList variant="av" aria-label="Deployment target">
              <TabsTrigger value="cli">CLI</TabsTrigger>
              <TabsTrigger value="docker">Docker</TabsTrigger>
              <TabsTrigger value="systemd">systemd</TabsTrigger>
            </TabsList>
            <TabsContent value="cli">
              <CodeBlock value={cliCommand(token, siteUrl)} />
            </TabsContent>
            <TabsContent value="docker">
              <CodeBlock value={dockerCommand(token, siteUrl)} />
            </TabsContent>
            <TabsContent value="systemd">
              <CodeBlock value={systemdUnit(token, siteUrl)} />
            </TabsContent>
          </Tabs>
          <p className="text-xs text-accent">
            <a
              href={AgentVaultDocsUrls.proxies}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:opacity-80"
            >
              Running a proxy
            </a>{" "}
            covers its settings, certificate trust and re-enrolling.
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
};
