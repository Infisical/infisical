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
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { TAgentVaultProxyToken } from "@app/hooks/api/agentVault/types";

const cliCommand = (token: string, siteUrl: string) =>
  `INFISICAL_AGENT_VAULT_PROXY_TOKEN=${token} \\
infisical agent-vault proxy \\
  --domain ${siteUrl}`;

const systemdEnvFile = (token: string) => `INFISICAL_AGENT_VAULT_PROXY_TOKEN=${token}`;

const systemdUnit = (siteUrl: string) =>
  `[Unit]
Description=Infisical Agent Vault proxy
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/infisical/agent-vault-proxy.env
ExecStart=/usr/local/bin/infisical agent-vault proxy --domain ${siteUrl}
Restart=always

[Install]
WantedBy=multi-user.target`;

const dockerCommand = (token: string, siteUrl: string) =>
  `docker run -d --name agent-vault-proxy \\
  -p 17323:17323 \\
  -v agent-vault-proxy:/etc/infisical/agent-vault \\
  -e INFISICAL_AGENT_VAULT_PROXY_TOKEN=${token} \\
  infisical/cli agent-vault proxy \\
  --domain ${siteUrl}`;

const kubernetesManifest = (token: string, siteUrl: string) =>
  `apiVersion: v1
kind: Secret
metadata:
  name: agent-vault-proxy
type: Opaque
stringData:
  INFISICAL_AGENT_VAULT_PROXY_TOKEN: ${token}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-vault-proxy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: agent-vault-proxy
  template:
    metadata:
      labels:
        app: agent-vault-proxy
    spec:
      containers:
        - name: agent-vault-proxy
          image: infisical/cli
          args: ["agent-vault", "proxy", "--domain", "${siteUrl}"]
          envFrom:
            - secretRef:
                name: agent-vault-proxy
          ports:
            - containerPort: 17323`;

type Props = {
  proxyToken: TAgentVaultProxyToken | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ProxyTokenDialog = ({ proxyToken, onOpenChange }: Props) => {
  const token = proxyToken?.proxyToken ?? "";
  const { protocol, hostname, port } = window.location;
  const siteUrl = `${protocol}//${hostname}${port && port !== "80" ? `:${port}` : ""}`;

  return (
    <Dialog open={Boolean(proxyToken)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Proxy Token</DialogTitle>
          <DialogDescription>
            Start the proxy with this token. You can run it on as many machines as you need.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              This token is shown only once. It works until you rotate it or revoke the proxy&apos;s
              access.
            </AlertDescription>
          </Alert>

          <CodeBlock value={token} label="Proxy token" />

          <Tabs defaultValue="cli">
            <TabsList variant="av" aria-label="Deployment target">
              <TabsTrigger value="cli">CLI</TabsTrigger>
              <TabsTrigger value="systemd">systemd</TabsTrigger>
              <TabsTrigger value="docker">Docker</TabsTrigger>
              <TabsTrigger value="kubernetes">Kubernetes</TabsTrigger>
            </TabsList>
            <TabsContent value="cli">
              <CodeBlock value={cliCommand(token, siteUrl)} label="Command" />
            </TabsContent>
            <TabsContent value="systemd" className="flex flex-col gap-4">
              <CodeBlock
                value={systemdEnvFile(token)}
                label="/etc/infisical/agent-vault-proxy.env (chmod 600)"
              />
              <CodeBlock
                value={systemdUnit(siteUrl)}
                label="/etc/systemd/system/agent-vault-proxy.service"
              />
            </TabsContent>
            <TabsContent value="docker">
              <CodeBlock value={dockerCommand(token, siteUrl)} label="Command" />
            </TabsContent>
            <TabsContent value="kubernetes">
              <CodeBlock value={kubernetesManifest(token, siteUrl)} label="Manifest" />
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
