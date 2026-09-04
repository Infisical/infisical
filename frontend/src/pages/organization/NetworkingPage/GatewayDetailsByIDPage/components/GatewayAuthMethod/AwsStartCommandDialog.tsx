import { useMemo, useState } from "react";

import {
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
  isDirect: boolean;
  listenAddress: string;
};

const AUTO_RELAY_OPTION = { id: "_auto", name: "Auto Select Relay" };

export const AwsStartCommandContent = ({
  gatewayId,
  gatewayName,
  isDirect,
  listenAddress
}: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const [relay, setRelay] = useState<{ id: string; name: string }>(AUTO_RELAY_OPTION);

  const resolvedRelayName = relay.id === "_auto" ? "" : relay.name;

  const cliCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --relay=${resolvedRelayName}` : "";
    const directPart = isDirect
      ? ` --listen-address=${listenAddress.trim() || "<gateway-address>:8443"}`
      : "";
    return `infisical gateway start ${gatewayName} --enroll-method=aws --gateway-id=${gatewayId}${relayPart}${directPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, isDirect, listenAddress, resolvedRelayName, siteURL]);

  const systemdInstallCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --relay=${resolvedRelayName}` : "";
    const directPart = isDirect
      ? ` --listen-address=${listenAddress.trim() || "<gateway-address>:8443"}`
      : "";
    return `sudo infisical gateway systemd install ${gatewayName} --enroll-method=aws --gateway-id=${gatewayId}${relayPart}${directPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, isDirect, listenAddress, resolvedRelayName, siteURL]);

  const startServiceCommand = `sudo systemctl start ${gatewayName}`;

  return (
    <div className="min-w-0 space-y-4">
      <TabsContent value="cli" className="min-w-0">
        <CodeBlock value={cliCommand} label="Command" />
      </TabsContent>
      <TabsContent value="systemd" className="min-w-0 space-y-4">
        <CodeBlock value={systemdInstallCommand} label="Install service" />
        <CodeBlock value={startServiceCommand} label="Start service" />
      </TabsContent>
      {!isDirect && (
        <Field>
          <Select
            value={relay.id}
            onValueChange={(id: string) =>
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
      )}
      <p className="text-xs text-muted">
        Requires AWS credentials matching the configured allowlist.
      </p>
    </div>
  );
};
