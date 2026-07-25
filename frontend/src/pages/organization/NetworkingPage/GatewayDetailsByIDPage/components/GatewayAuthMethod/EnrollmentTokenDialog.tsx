import { useEffect, useMemo, useState } from "react";

import {
  Badge,
  CodeBlock,
  Field,
  FieldDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsContent
} from "@app/components/v3";
import { useGetRelays } from "@app/hooks/api/relays/queries";

type Props = {
  gatewayName: string;
  enrollmentToken: string;
  expiresAt: string;
};

const AUTO_RELAY_OPTION = { id: "_auto", name: "Auto Select Relay" };

const formatTimeRemaining = (expiresAt: string, now: number) => {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  if (remainingSeconds === 0) return "Expired";

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m ${seconds}s remaining`;
};

// Renders a freshly minted token as inline deployment instructions.
export const EnrollmentTokenContent = ({ gatewayName, enrollmentToken, expiresAt }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const [relay, setRelay] = useState<{ id: string; name: string }>(AUTO_RELAY_OPTION);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const resolvedRelayName = relay.id === "_auto" ? "" : relay.name;
  const expiryLabel = formatTimeRemaining(expiresAt, now);
  const isExpired = expiryLabel === "Expired";

  const cliCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    return `infisical gateway start ${gatewayName} --enroll-method=token --token=${enrollmentToken}${relayPart} --domain=${siteURL}`;
  }, [gatewayName, enrollmentToken, resolvedRelayName, siteURL]);

  const systemdInstallCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    return `sudo infisical gateway systemd install ${gatewayName} --enroll-method=token --token=${enrollmentToken}${relayPart} --domain=${siteURL}`;
  }, [gatewayName, enrollmentToken, resolvedRelayName, siteURL]);

  const startServiceCommand = `sudo systemctl start ${gatewayName}`;
  const commandLabel = (
    <span className="flex flex-wrap items-center gap-2">
      <span>Command</span>
      <Badge variant="info">Token Auth</Badge>
      <Badge variant={isExpired ? "danger" : "neutral"}>{expiryLabel}</Badge>
    </span>
  );

  return (
    <div className="min-w-0 space-y-4">
      <TabsContent value="cli" className="mt-0 min-w-0">
        <CodeBlock value={cliCommand} label={commandLabel} isCopyable={!isExpired} />
      </TabsContent>
      <TabsContent value="systemd" className="mt-0 min-w-0 space-y-4">
        <CodeBlock
          value={systemdInstallCommand}
          isCopyable={!isExpired}
          label={
            <span className="flex flex-wrap items-center gap-2">
              <span>Install service</span>
              <Badge variant="info">Token Auth</Badge>
              <Badge variant={isExpired ? "danger" : "neutral"}>{expiryLabel}</Badge>
            </span>
          }
        />
        <CodeBlock value={startServiceCommand} label="Start service" />
      </TabsContent>
      <Field>
        <Select
          value={relay.id}
          onValueChange={(id) =>
            setRelay(
              [AUTO_RELAY_OPTION, ...(relays || [])].find((item) => item.id === id) ||
                AUTO_RELAY_OPTION
            )
          }
          disabled={isRelaysLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select relay" />
          </SelectTrigger>
          <SelectContent>
            {[AUTO_RELAY_OPTION, ...(relays || [])].map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {relay.id !== "_auto" && (
          <FieldDescription>
            * Auto Select chooses a healthy relay and fails over if needed.
          </FieldDescription>
        )}
      </Field>
    </div>
  );
};
