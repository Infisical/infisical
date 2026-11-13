import { useEffect, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Tabs } from "@infisical/cipher/ui/tabs";

import type { TKmipServerWithAuthMethod } from "@app/hooks/api/kmipServers/types";

import type { KmipEnrollment } from "../../data/kmip/contract";
import { KMIP_CLIENT_DOCS } from "./shared";

import css from "./kmip.module.css";

const START_SERVICE = "sudo systemctl start infisical-kmip";

const siteUrl = () => {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port && port !== "80" ? `:${port}` : ""}`;
};

const remaining = (expiresAt: string, now: number) => {
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  if (seconds === 0) return undefined;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m ${seconds % 60}s remaining`;
};

const useNow = (active: boolean) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
};

const methods = [
  { value: "cli", label: "CLI" },
  { value: "systemd", label: "System service" }
];

export const DeployCard = ({
  server,
  canEdit,
  enrollment,
  minting,
  onGenerate
}: {
  server: TKmipServerWithAuthMethod;
  canEdit: boolean;
  enrollment: KmipEnrollment | null;
  minting: boolean;
  onGenerate: () => void;
}) => {
  const [method, setMethod] = useState("cli");
  const now = useNow(Boolean(enrollment));
  const { authMethod } = server;
  if (authMethod.method === "identity") return null;

  const isAws = authMethod.method === "aws";
  const showCommands = canEdit && (isAws || Boolean(enrollment));
  const expiry = enrollment ? remaining(enrollment.expiresAt, now) : undefined;
  const expired = Boolean(enrollment) && !expiry;
  const args = isAws
    ? `--enroll-method=aws --kmip-server-id=${server.id} --domain=${siteUrl()}`
    : `--enroll-method=token --token=${enrollment?.token ?? ""} --domain=${siteUrl()}`;
  const expiryBadge = enrollment ? (
    <Badge tone={expired ? "bad" : "outline"}>{expiry ?? "Expired"}</Badge>
  ) : undefined;

  let body;
  if (!canEdit)
    body = (
      <Alert tone="warn" title="Access restricted">
        You don&apos;t have permission to generate KMIP server deployment commands.
      </Alert>
    );
  else if (!showCommands)
    body = (
      <span className={css.start}>
        <Button variant="outline" icon="terminal" loading={minting} onClick={onGenerate}>
          Generate deploy command
        </Button>
      </span>
    );
  else
    body = (
      <Stack gap={16}>
        {method === "cli" ? (
          <CodeBlock
            label="Command"
            code={`infisical kmip start ${server.name} ${args}`}
            copyable={!expired}
            copyLabel="Copy command"
            actions={expiryBadge}
          />
        ) : (
          <>
            <CodeBlock
              label="Install service"
              code={`sudo infisical kmip systemd install ${server.name} ${args}`}
              copyable={!expired}
              copyLabel="Copy install command"
              actions={expiryBadge}
            />
            <CodeBlock label="Start service" code={START_SERVICE} copyLabel="Copy start command" />
          </>
        )}
        <span className={css.note}>
          {isAws
            ? "The host needs AWS credentials whose principal matches the allowlist. The certificate configuration is read from this server's settings."
            : "The enrollment token can be used once. The certificate configuration is read from this server's settings."}
        </span>
        {!isAws && (
          <span className={css.start}>
            <Button variant="outline" icon="sync" loading={minting} onClick={onGenerate}>
              Regenerate command
            </Button>
          </span>
        )}
      </Stack>
    );

  return (
    <Card
      variant="framed"
      title="Deployment"
      action={
        showCommands ? (
          <Tabs
            variant="segmented"
            label="Deployment method"
            tabs={methods}
            value={method}
            onChange={setMethod}
          />
        ) : undefined
      }
    >
      {body}
    </Card>
  );
};

export const ConnectClientsCard = () => (
  <Card
    variant="framed"
    title={
      <Inline gap={8} wrap={false}>
        Connecting KMIP clients
        <DocumentationLink href={KMIP_CLIENT_DOCS} subject="KMIP clients" />
      </Inline>
    }
    description="Clients connect with a client certificate and are managed per KMS project."
  >
    <ol className={css.steps}>
      <li className={css.step}>Deploy this KMIP server on a target host.</li>
      <li className={css.step}>Create a KMIP client in a KMS project&apos;s KMIP page.</li>
      <li className={css.step}>Generate a client certificate for that client.</li>
      <li className={css.step}>
        Point your KMIP application at the server address using the client certificate.
      </li>
    </ol>
  </Card>
);
