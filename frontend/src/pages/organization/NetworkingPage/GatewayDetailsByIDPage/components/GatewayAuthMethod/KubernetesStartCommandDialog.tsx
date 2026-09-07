import { useMemo, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  includeRelay: boolean;
  listenAddress: string;
};

const AUTO_RELAY_OPTION = { id: "_auto", name: "Auto Select Relay" };

// Stands in until the listen address is filled in and valid, so a copied command never carries
// an address the API would reject.
const PLACEHOLDER_ADDRESS = "<gateway-address>:8443";

export const KubernetesStartCommandContent = ({
  gatewayId,
  gatewayName,
  isDirect,
  includeRelay,
  listenAddress
}: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const [relay, setRelay] = useState<{ id: string; name: string }>(AUTO_RELAY_OPTION);

  const resolvedRelayName = !includeRelay || relay.id === "_auto" ? "" : relay.name;

  const helmCommand = useMemo(() => {
    // The chart derives the container port and the Service port from listenAddress, so setting
    // service.port here would only re-derive the same value in a second place.
    const directPart = isDirect
      ? ` \\\n  --set gateway.listenAddress=${listenAddress || PLACEHOLDER_ADDRESS}`
      : "";
    const relayPart = resolvedRelayName
      ? ` \\\n  --set gateway.relayName=${resolvedRelayName}`
      : "";
    return `helm repo add infisical https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/
helm install infisical-gateway infisical/infisical-gateway \\
  --namespace infisical-gateway --create-namespace \\
  --set gateway.name=${gatewayName} \\
  --set gateway.domain=${siteURL} \\
  --set gateway.enrollment.method=kubernetes \\
  --set gateway.enrollment.kubernetes.gatewayId=${gatewayId}${relayPart}${directPart}`;
  }, [gatewayName, gatewayId, isDirect, listenAddress, resolvedRelayName, siteURL]);

  const cliCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --relay=${resolvedRelayName}` : "";
    const directPart = isDirect ? ` --listen-address=${listenAddress || PLACEHOLDER_ADDRESS}` : "";
    return `infisical gateway start ${gatewayName} --enroll-method=kubernetes --gateway-id=${gatewayId}${relayPart}${directPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, isDirect, listenAddress, resolvedRelayName, siteURL]);

  return (
    <div className="min-w-0 space-y-4">
      <TabsContent value="helm" className="mt-0 min-w-0 space-y-3">
        <CodeBlock value={helmCommand} label="Install chart" />
        {isDirect && (
          <Alert variant="warning" appearance="borderless">
            <TriangleAlertIcon />
            <AlertTitle>Check the chart&apos;s image tag before installing</AlertTitle>
            <AlertDescription>
              <code>gateway.listenAddress</code> needs a CLI image that supports{" "}
              <code>--listen-address</code>. The chart&apos;s default tag predates the flag, so add{" "}
              <code>--set image.tag=&lt;version&gt;</code> with a release that includes it.
              Otherwise the pod crash-loops on <code>unknown flag: --listen-address</code>.
            </AlertDescription>
          </Alert>
        )}
      </TabsContent>
      <TabsContent value="cli" className="mt-0 min-w-0">
        <CodeBlock value={cliCommand} label="Container command" />
        <p className="mt-2 text-xs text-muted">
          Runs inside the cluster, since it reads the pod&apos;s service account token. The domain
          must be reachable from the pod, so a loopback address will not work.
        </p>
      </TabsContent>
      {includeRelay && (
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
        The gateway must run in a namespace and service account matching the configured allowlists.
      </p>
    </div>
  );
};
