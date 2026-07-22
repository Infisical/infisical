import { useEffect, useMemo, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";

import { Badge, CodeBlock, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";

type Props = {
  relayId: string;
  relayName: string;
  authMethod: "token" | "aws";
  enrollmentToken?: string;
  expiresAt?: string;
};

const formatTimeRemaining = (expiresAt: string, now: number) => {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  if (remainingSeconds === 0) return "Expired";

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m ${seconds}s remaining`;
};

export const RelayDeployCommandContent = ({
  relayId,
  relayName,
  authMethod,
  enrollmentToken,
  expiresAt
}: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const cliCommand = useMemo(() => {
    if (authMethod === "aws") {
      return `infisical relay start --name=${relayName} --enroll-method=aws --relay-id=${relayId} --domain=${siteURL}`;
    }
    return `infisical relay start --name=${relayName} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  }, [relayName, relayId, enrollmentToken, authMethod, siteURL]);

  const systemdInstallCommand = useMemo(() => {
    if (authMethod === "aws") {
      return `sudo infisical relay systemd install --name=${relayName} --enroll-method=aws --relay-id=${relayId} --domain=${siteURL}`;
    }
    return `sudo infisical relay systemd install --name=${relayName} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  }, [relayName, relayId, enrollmentToken, authMethod, siteURL]);

  const startServiceCommand = "sudo systemctl start infisical-relay";
  const expiryLabel = expiresAt ? formatTimeRemaining(expiresAt, now) : null;
  const badgeLabel = authMethod === "aws" ? "AWS Auth" : "Token Auth";
  const label = (title: string) => (
    <span className="flex flex-wrap items-center gap-2">
      <span>{title}</span>
      <Badge variant="info">{badgeLabel}</Badge>
      {expiryLabel && (
        <Badge variant={expiryLabel === "Expired" ? "danger" : "neutral"}>{expiryLabel}</Badge>
      )}
    </span>
  );

  return (
    <div className="min-w-0 space-y-4">
      <Tabs defaultValue="cli" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList variant="filled">
            <TabsTrigger value="cli">CLI</TabsTrigger>
            <TabsTrigger value="systemd">System service</TabsTrigger>
          </TabsList>
          <a
            href="https://infisical.com/docs/cli/overview"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-label underline underline-offset-4 hover:text-foreground"
          >
            Installation guide
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
        <TabsContent value="cli" className="min-w-0">
          <CodeBlock value={cliCommand} label={label("Command")} />
        </TabsContent>
        <TabsContent value="systemd" className="min-w-0 space-y-4">
          <CodeBlock value={systemdInstallCommand} label={label("Install service")} />
          <CodeBlock value={startServiceCommand} label="Start service" />
        </TabsContent>
      </Tabs>
      {authMethod === "aws" && (
        <p className="text-xs text-muted">
          Requires AWS credentials matching the configured allowlist.
        </p>
      )}
    </div>
  );
};
