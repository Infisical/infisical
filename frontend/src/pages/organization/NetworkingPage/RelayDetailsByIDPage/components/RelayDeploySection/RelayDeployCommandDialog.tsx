import { useEffect, useMemo, useState } from "react";

import { Badge, CodeBlock, TabsContent } from "@app/components/v3";

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
      return `sudo infisical relay systemd install ${relayName} --enroll-method=aws --relay-id=${relayId} --domain=${siteURL}`;
    }
    return `sudo infisical relay systemd install ${relayName} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  }, [relayName, relayId, enrollmentToken, authMethod, siteURL]);

  const startServiceCommand = `sudo systemctl start ${relayName}`;
  const expiryLabel = expiresAt ? formatTimeRemaining(expiresAt, now) : null;
  const isExpired = expiryLabel === "Expired";
  const label = (title: string) => (
    <span className="flex w-full items-center justify-between gap-2">
      <span>{title}</span>
      {expiryLabel && (
        <Badge className="tabular-nums" variant={expiryLabel === "Expired" ? "danger" : "neutral"}>
          {expiryLabel}
        </Badge>
      )}
    </span>
  );

  return (
    <div className="min-w-0 space-y-4">
      <TabsContent value="cli" className="mt-0 min-w-0">
        <CodeBlock value={cliCommand} label={label("Command")} isCopyable={!isExpired} />
      </TabsContent>
      <TabsContent value="systemd" className="mt-0 min-w-0 space-y-4">
        <CodeBlock
          value={systemdInstallCommand}
          label={label("Install service")}
          isCopyable={!isExpired}
        />
        <CodeBlock value={startServiceCommand} label="Start service" />
      </TabsContent>
      {authMethod === "aws" && (
        <p className="text-xs text-muted">
          Requires AWS credentials matching the configured allowlist.
        </p>
      )}
    </div>
  );
};
