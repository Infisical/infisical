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
};

const AUTO_RELAY_OPTION = { id: "_auto", name: "Auto Select Relay" };

export const KubernetesStartCommandContent = ({ gatewayId, gatewayName }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const [relay, setRelay] = useState<{ id: string; name: string }>(AUTO_RELAY_OPTION);

  const resolvedRelayName = relay.id === "_auto" ? "" : relay.name;

  const helmCommand = useMemo(() => {
    const relayPart = resolvedRelayName
      ? ` \\\n  --set gateway.relayName=${resolvedRelayName}`
      : "";
    return `helm repo add infisical-helm-charts https://dl.infisical.com/helm-charts
helm install infisical-gateway infisical-helm-charts/infisical-gateway \\
  --namespace infisical-gateway --create-namespace \\
  --set gateway.name=${gatewayName} \\
  --set gateway.domain=${siteURL} \\
  --set gateway.enrollment.method=kubernetes \\
  --set gateway.enrollment.kubernetes.gatewayId=${gatewayId}${relayPart}`;
  }, [gatewayName, gatewayId, resolvedRelayName, siteURL]);

  const cliCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    return `infisical gateway start ${gatewayName} --enroll-method=kubernetes --gateway-id=${gatewayId}${relayPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, resolvedRelayName, siteURL]);

  return (
    <div className="min-w-0 space-y-4">
      <TabsContent value="helm" className="mt-0 min-w-0">
        <CodeBlock value={helmCommand} label="Install chart" />
      </TabsContent>
      <TabsContent value="cli" className="mt-0 min-w-0">
        <CodeBlock value={cliCommand} label="Container command" />
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
        The gateway must run in a namespace and service account matching the configured allowlists.
      </p>
    </div>
  );
};
