import { formatDistanceToNowStrict } from "date-fns";

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

const dockerCommand = (token: string, siteUrl: string) =>
  `docker run -d --name agent-vault-proxy \\
  -p 17323:17323 \\
  infisical/cli av proxy \\
  --enrollment-token ${token} \\
  --domain ${siteUrl}`;

const kubernetesManifest = (token: string, siteUrl: string) =>
  `apiVersion: v1
kind: Secret
metadata:
  name: agent-vault-proxy
stringData:
  enrollmentToken: ${token}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-vault-proxy
spec:
  replicas: 1
  selector:
    matchLabels: { app: agent-vault-proxy }
  template:
    metadata:
      labels: { app: agent-vault-proxy }
    spec:
      containers:
        - name: proxy
          image: infisical/cli
          args:
            [
              "av",
              "proxy",
              "--enrollment-token",
              "$(ENROLLMENT_TOKEN)",
              "--domain",
              "${siteUrl}"
            ]
          env:
            - name: ENROLLMENT_TOKEN
              valueFrom:
                secretKeyRef: { name: agent-vault-proxy, key: enrollmentToken }
          ports:
            - containerPort: 17323`;

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
            Shown once. Copy it now.
            {enrollment &&
              ` Expires in ${formatDistanceToNowStrict(new Date(enrollment.expiresAt))}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <CodeBlock value={token} label="Enrollment token" />

          <Tabs defaultValue="docker">
            <TabsList variant="av" aria-label="Deployment target">
              <TabsTrigger value="docker">Docker</TabsTrigger>
              <TabsTrigger value="kubernetes">Kubernetes</TabsTrigger>
              <TabsTrigger value="systemd">systemd</TabsTrigger>
            </TabsList>
            <TabsContent value="docker">
              <CodeBlock value={dockerCommand(token, siteUrl)} />
            </TabsContent>
            <TabsContent value="kubernetes">
              <CodeBlock value={kubernetesManifest(token, siteUrl)} />
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
