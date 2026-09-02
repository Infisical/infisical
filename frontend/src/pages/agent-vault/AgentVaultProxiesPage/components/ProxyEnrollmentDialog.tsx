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

const dockerCommand = (token: string) =>
  `docker run -d --name agent-vault-proxy \\
  -p 17323:17323 \\
  infisical/cli av proxy \\
  --enrollment-token ${token}`;

const kubernetesManifest = (token: string) =>
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
          args: ["av", "proxy", "--enrollment-token", "$(ENROLLMENT_TOKEN)"]
          env:
            - name: ENROLLMENT_TOKEN
              valueFrom:
                secretKeyRef: { name: agent-vault-proxy, key: enrollmentToken }
          ports:
            - containerPort: 17323`;

const systemdUnit = (token: string) =>
  `[Unit]
Description=Infisical Agent Vault proxy
After=network-online.target

[Service]
ExecStart=/usr/local/bin/infisical av proxy --enrollment-token ${token}
Restart=always

[Install]
WantedBy=multi-user.target`;

type Props = {
  enrollment: TAgentVaultEnrollment | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ProxyEnrollmentDialog = ({ enrollment, onOpenChange }: Props) => {
  const token = enrollment?.token ?? "";

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
              <CodeBlock value={dockerCommand(token)} />
            </TabsContent>
            <TabsContent value="kubernetes">
              <CodeBlock value={kubernetesManifest(token)} />
            </TabsContent>
            <TabsContent value="systemd">
              <CodeBlock value={systemdUnit(token)} />
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
