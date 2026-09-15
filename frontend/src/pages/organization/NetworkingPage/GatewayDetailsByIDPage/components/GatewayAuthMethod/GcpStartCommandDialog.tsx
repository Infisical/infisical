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
  gcpAuthType: "gce" | "iam";
  allowedServiceAccounts: string;
  isDirect: boolean;
  listenAddress: string;
};

const AUTO_RELAY_OPTION = { id: "_auto", name: "Auto Select Relay" };

const PLACEHOLDER_ADDRESS = "<gateway-address>:8443";

export const GcpStartCommandContent = ({
  gatewayId,
  gatewayName,
  gcpAuthType,
  allowedServiceAccounts,
  isDirect,
  listenAddress
}: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const [relay, setRelay] = useState<{ id: string; name: string }>(AUTO_RELAY_OPTION);

  const resolvedRelayName = isDirect || relay.id === "_auto" ? "" : relay.name;
  // gce is the CLI default, so only the iam type needs the flag spelled out.
  const authTypePart = gcpAuthType === "iam" ? " --gcp-auth-type=iam" : "";
  // Without this annotation the chart creates an unbound service account, and the pod authenticates
  // as nothing the gateway allows. The first allowed account is the best guess available here.
  const workloadIdentityAccount =
    allowedServiceAccounts.split(",")[0]?.trim() ||
    "<gsa-name>@<project-id>.iam.gserviceaccount.com";

  const cliCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    const directPart = isDirect ? ` --listen-address=${listenAddress || PLACEHOLDER_ADDRESS}` : "";
    return `infisical gateway start ${gatewayName} --enroll-method=gcp --gateway-id=${gatewayId}${authTypePart}${relayPart}${directPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, authTypePart, isDirect, listenAddress, resolvedRelayName, siteURL]);

  const systemdInstallCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    const directPart = isDirect ? ` --listen-address=${listenAddress || PLACEHOLDER_ADDRESS}` : "";
    return `sudo infisical gateway systemd install ${gatewayName} --enroll-method=gcp --gateway-id=${gatewayId}${authTypePart}${relayPart}${directPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, authTypePart, isDirect, listenAddress, resolvedRelayName, siteURL]);

  const helmCommand = useMemo(() => {
    const directPart = isDirect
      ? ` \\\n  --set gateway.listenAddress=${listenAddress || PLACEHOLDER_ADDRESS}`
      : "";
    const relayPart = resolvedRelayName
      ? ` \\\n  --set gateway.relayName=${resolvedRelayName}`
      : "";
    const authTypeSet = gcpAuthType === "iam" ? ` \\\n  --set gateway.enrollment.gcp.type=iam` : "";
    return `helm repo add infisical https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/
helm install infisical-gateway infisical/infisical-gateway \\
  --namespace infisical-gateway --create-namespace \\
  --set gateway.name=${gatewayName} \\
  --set gateway.domain=${siteURL} \\
  --set gateway.enrollment.method=gcp \\
  --set gateway.enrollment.gcp.gatewayId=${gatewayId}${authTypeSet}${annotationSet}${relayPart}${directPart}`;
  }, [
    gatewayName,
    gatewayId,
    gcpAuthType,
    workloadIdentityAccount,
    isDirect,
    listenAddress,
    resolvedRelayName,
    siteURL
  ]);

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
      <TabsContent value="helm" className="min-w-0">
        <CodeBlock value={helmCommand} label="Command" />
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
        {gcpAuthType === "iam"
          ? "Requires credentials holding roles/iam.serviceAccountTokenCreator on a service account in the configured allowlist."
          : "Requires the gateway to run on a Compute Engine instance, or a GKE pod with workload identity, whose service account matches the configured allowlist."}
      </p>
    </div>
  );
};
