import { useEffect, useState } from "react";

import { Badge, CodeBlock, TabsContent } from "@app/components/v3";

import { getKmipServerSiteUrl, KMIP_START_SERVICE_COMMAND } from "./commands";

const formatTimeRemaining = (expiresAt: string, now: number) => {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  if (remainingSeconds === 0) return "Expired";

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m ${seconds}s remaining`;
};

export const EnrollmentTokenContent = ({ kmipServerName, enrollmentToken, expiresAt }: Props) => {
  const siteURL = getKmipServerSiteUrl();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const expiryLabel = formatTimeRemaining(expiresAt, now);
  const isExpired = expiryLabel === "Expired";
  const enrollArgs = `--enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  const cliCommand = `infisical kmip start ${kmipServerName} ${enrollArgs}`;
  const systemdInstallCommand = `sudo infisical kmip systemd install ${kmipServerName} ${enrollArgs}`;

  const labelWithExpiry = (label: string) => (
    <span className="flex w-full items-center justify-between gap-2">
      <span>{label}</span>
      <Badge variant={isExpired ? "danger" : "neutral"}>{expiryLabel}</Badge>
    </span>
  );

  return (
    <div className="min-w-0 space-y-4">
      <TabsContent value="cli" className="min-w-0">
        <CodeBlock value={cliCommand} label={labelWithExpiry("Command")} isCopyable={!isExpired} />
      </TabsContent>
      <TabsContent value="systemd" className="min-w-0 space-y-4">
        <CodeBlock
          value={systemdInstallCommand}
          label={labelWithExpiry("Install service")}
          isCopyable={!isExpired}
        />
        <CodeBlock value={KMIP_START_SERVICE_COMMAND} label="Start service" />
      </TabsContent>
      <p className="text-xs text-muted">
        The enrollment token can be used once. The certificate config (hostnames or IPs, TTL, key
        algorithm) is read from this server&apos;s settings.
      </p>
    </div>
  );
};

type Props = {
  kmipServerName: string;
  enrollmentToken: string;
  expiresAt: string;
};
