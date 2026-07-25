import { useMemo, useState } from "react";

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
  gatewayId: string;
  gatewayName: string;
};

const AUTO_RELAY_OPTION = { id: "_auto", name: "Auto Select Relay" };

export const AwsStartCommandContent = ({ gatewayId, gatewayName }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const [relay, setRelay] = useState<{ id: string; name: string }>(AUTO_RELAY_OPTION);

  const resolvedRelayName = relay.id === "_auto" ? "" : relay.name;

  const cliCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    return `infisical gateway start ${gatewayName} --enroll-method=aws --gateway-id=${gatewayId}${relayPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, resolvedRelayName, siteURL]);

  const systemdInstallCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    return `sudo infisical gateway systemd install ${gatewayName} --enroll-method=aws --gateway-id=${gatewayId}${relayPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, resolvedRelayName, siteURL]);

  const startServiceCommand = `sudo systemctl start ${gatewayName}`;

  const commandLabel = (
    <span className="flex flex-wrap items-center gap-2">
      <span>Command</span>
      <Badge variant="info">AWS Auth</Badge>
    </span>
  );

  return (
    <div className="min-w-0 space-y-4">
      <TabsContent value="cli" className="mt-0 min-w-0">
        <CodeBlock value={cliCommand} label={commandLabel} />
      </TabsContent>
      <TabsContent value="systemd" className="mt-0 min-w-0 space-y-4">
        <CodeBlock
          value={systemdInstallCommand}
          label={
            <span className="flex flex-wrap items-center gap-2">
              <span>Install service</span>
              <Badge variant="info">AWS Auth</Badge>
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
      <p className="text-xs text-muted">
        Requires AWS credentials matching the configured allowlist.
      </p>
    </div>
  );
};
