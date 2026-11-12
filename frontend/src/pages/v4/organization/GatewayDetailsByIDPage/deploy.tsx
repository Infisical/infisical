import { useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle
} from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RadioGroup, RadioGroupItem } from "@infisical/cipher/ui/radio-group";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { SmallText } from "@infisical/cipher/ui/text";

import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isInfisicalCloud } from "@app/helpers/platform";
import type {
  TGatewayEnrollmentToken,
  TGatewayV2WithAuthMethod
} from "@app/hooks/api/gateways-v2/types";

import { useOrgPermission } from "../../access/permissions";
import { useV4Adapter } from "../../data/adapters";
import {
  AUTO_RELAY,
  DeployRestricted,
  PLACEHOLDER_ADDRESS,
  type RelayChoice,
  RelaySelect,
  siteUrl,
  useEnrollmentExpiry
} from "../../networking/deploy-parts";

// Mirrors the backend's parseDirectAddress so the form rejects exactly what the API would.
const isValidListenAddress = (address: string) => {
  try {
    const parsed = new URL(`tcp://${address}`);
    if (
      !parsed.hostname ||
      !parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.pathname ||
      parsed.search ||
      parsed.hash
    ) {
      return false;
    }
    const port = Number(parsed.port);
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  } catch {
    return false;
  }
};

const HELM_REPO =
  "helm repo add infisical https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/";

type Enrollment = TGatewayEnrollmentToken & { gatewayId: string; relay: RelayChoice };

type Block = { label: string; code: string; expiring?: boolean };

const ConnectionModeChoice = ({
  value,
  title,
  badge,
  description
}: {
  value: "direct" | "relay";
  title: string;
  badge?: string;
  description: string;
}) => (
  <FieldLabel htmlFor={`gateway-connection-mode-${value}`}>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>
          {title}
          {badge && <Badge tone="soft">{badge}</Badge>}
        </FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <RadioGroupItem value={value} id={`gateway-connection-mode-${value}`} />
    </Field>
  </FieldLabel>
);

export const GatewayDeployCard = ({ gateway }: { gateway: TGatewayV2WithAuthMethod }) => {
  const { id: gatewayId, name: gatewayName, authMethod } = gateway;
  const { permission } = useOrgPermission();
  const mint = useV4Adapter("networking").useMintGatewayToken();
  const isCloud = isInfisicalCloud();
  // Relay only for Cloud, which cannot route inward, and for a gateway already running relay alone.
  const isRelayOnlyGateway = Boolean(gateway.relayId) && !gateway.directAddress;
  const [connectionMode, setConnectionMode] = useState<"relay" | "direct">(
    isCloud || isRelayOnlyGateway ? "relay" : "direct"
  );
  const [listenAddress, setListenAddress] = useState(gateway.directAddress ?? "");
  const [deploymentMethod, setDeploymentMethod] = useState("");
  const [relay, setRelay] = useState<RelayChoice>(AUTO_RELAY);
  const [minted, setMinted] = useState<Enrollment | null>(null);
  const mintSequence = useRef(0);
  const enrollment = minted?.gatewayId === gatewayId ? minted : null;
  const { badge: expiryBadge, isExpired } = useEnrollmentExpiry(enrollment?.expiresAt);
  const canEdit = permission.can(
    OrgGatewayPermissionActions.EditGateways,
    OrgPermissionSubjects.Gateway
  );

  if (authMethod.method === "identity") return null;

  const isDirect = connectionMode === "direct";
  const isKubernetes = authMethod.method === "kubernetes";
  const isGcp = authMethod.method === "gcp";
  const isToken = authMethod.method === "token";
  const trimmedListenAddress = listenAddress.trim();
  const hasListenAddressError =
    trimmedListenAddress.length > 0 && !isValidListenAddress(trimmedListenAddress);
  // Keep a malformed address out of a copyable command.
  const address = (hasListenAddressError ? "" : trimmedListenAddress) || PLACEHOLDER_ADDRESS;
  const showDeploymentControls = !isToken || Boolean(enrollment);
  const isCommandDirty = Boolean(enrollment) && !isDirect && relay.id !== enrollment?.relay.id;

  // Derived, so switching auth method can't leave a tab selected that the new method lacks.
  let tabs = [
    { value: "cli", label: "CLI" },
    { value: "systemd", label: "System service" }
  ];
  if (isKubernetes)
    tabs = [
      { value: "helm", label: "Helm" },
      { value: "cli", label: "Container command" }
    ];
  if (isGcp) tabs = [...tabs, { value: "helm", label: "Helm" }];
  const activeTab = tabs.some((tab) => tab.value === deploymentMethod)
    ? deploymentMethod
    : tabs[0].value;

  const handleGenerate = async () => {
    const sequence = mintSequence.current + 1;
    mintSequence.current = sequence;
    try {
      const result = await mint.mutateAsync({ gatewayId });
      // Minting deletes the previous token, so a slower earlier response would show a dead one.
      if (mintSequence.current !== sequence) return;
      setMinted({ ...result, gatewayId, relay });
    } catch {
      // The global mutation handler reports the API error.
    }
  };

  const handleConnectionModeChange = (value: string) => {
    const nextMode = value as "relay" | "direct";
    if (nextMode === connectionMode) return;
    setConnectionMode(nextMode);
    // The command rewrites its flags on mode change, and enrollment tokens are single use.
    if (enrollment) handleGenerate();
  };

  const commandRelay = isToken ? (enrollment?.relay ?? AUTO_RELAY) : relay;
  const relayName = isDirect || commandRelay.id === AUTO_RELAY.id ? "" : commandRelay.name;
  const domain = siteUrl();
  const enroll = (() => {
    if (authMethod.method === "token") return ` --enroll-method=token --token=${enrollment?.token}`;
    if (authMethod.method === "gcp")
      return ` --enroll-method=gcp --gateway-id=${gatewayId}${authMethod.config.type === "iam" ? " --gcp-auth-type=iam" : ""}`;
    return ` --enroll-method=${authMethod.method} --gateway-id=${gatewayId}`;
  })();
  const flags = `${enroll}${relayName ? ` --target-relay-name=${relayName}` : ""}${isDirect ? ` --listen-address=${address}` : ""} --domain=${domain}`;
  const cliCommand = `infisical gateway start ${gatewayName}${flags}`;
  const systemdCommand = `sudo infisical gateway systemd install ${gatewayName}${flags}`;
  const helmTail = `${relayName ? ` \\\n  --set gateway.relayName=${relayName}` : ""}${isDirect ? ` \\\n  --set gateway.listenAddress=${address}` : ""}`;
  const helmHead = `${HELM_REPO}
helm install infisical-gateway infisical/infisical-gateway \\
  --namespace infisical-gateway --create-namespace \\
  --set gateway.name=${gatewayName} \\
  --set gateway.domain=${domain} \\`;

  const blocks = ((): Block[] => {
    if (authMethod.method === "kubernetes") {
      if (activeTab === "helm")
        return [
          {
            label: "Install chart",
            code: `${helmHead}
  --set gateway.enrollment.method=kubernetes \\
  --set gateway.enrollment.kubernetes.gatewayId=${gatewayId}${helmTail}`
          }
        ];
      return [{ label: "Container command", code: cliCommand }];
    }
    if (authMethod.method === "gcp" && activeTab === "helm") {
      // Without this the chart creates an unbound service account and the pod authenticates as nothing.
      const workloadIdentityAccount =
        authMethod.config.allowedServiceAccounts.split(",")[0]?.trim() ||
        "<gsa-name>@<project-id>.iam.gserviceaccount.com";
      const iamType = authMethod.config.type === "iam";
      return [
        {
          label: "Command",
          code: `${helmHead}
  --set gateway.enrollment.method=gcp \\
  --set gateway.enrollment.gcp.gatewayId=${gatewayId}${iamType ? " \\\n  --set gateway.enrollment.gcp.type=iam" : ""} \\
  --set serviceAccount.annotations."iam\\.gke\\.io/gcp-service-account"=${workloadIdentityAccount}${helmTail}`
        }
      ];
    }
    if (activeTab === "systemd")
      return [
        { label: "Install service", code: systemdCommand, expiring: isToken },
        { label: "Start service", code: `sudo systemctl start ${gatewayName}` }
      ];
    return [{ label: "Command", code: cliCommand, expiring: isToken }];
  })();

  const note = (() => {
    if (authMethod.method === "aws")
      return "Requires AWS credentials matching the configured allowlist.";
    if (authMethod.method === "gcp")
      return authMethod.config.type === "iam"
        ? "Requires credentials holding roles/iam.serviceAccountTokenCreator on a service account in the configured allowlist."
        : "Requires the gateway to run on a Compute Engine instance, or a GKE pod with workload identity, whose service account matches the configured allowlist.";
    if (authMethod.method === "kubernetes")
      return "The gateway must run in a namespace and service account matching the configured allowlists.";
    return undefined;
  })();

  const commands = (
    <>
      {blocks.map((block) => (
        <CodeBlock
          key={block.label}
          label={block.label}
          language="shell"
          wrap
          code={block.code}
          copyable={!(block.expiring && isExpired)}
          actions={block.expiring ? expiryBadge : undefined}
        />
      ))}
      {isKubernetes && activeTab === "helm" && isDirect && (
        <Alert tone="warn" title="Check the chart's image tag before installing">
          gateway.listenAddress needs a CLI image that supports --listen-address. The chart&apos;s
          default tag predates the flag, so add --set image.tag=&lt;version&gt; with a release that
          includes it. Otherwise the pod crash loops on unknown flag: --listen-address.
        </Alert>
      )}
      {isKubernetes && activeTab === "cli" && (
        <SmallText muted>
          Runs inside the cluster, since it reads the pod&apos;s service account token. The domain
          must be reachable from the pod, so a loopback address will not work.
        </SmallText>
      )}
      {!isDirect && <RelaySelect value={relay} onChange={setRelay} />}
      {note && <SmallText muted>{note}</SmallText>}
    </>
  );

  return (
    <Card
      variant="framed"
      title={
        <Inline gap={8} wrap={false}>
          Deployment
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/gateways/gateway-deployment" />
        </Inline>
      }
      action={
        canEdit && showDeploymentControls ? (
          <Tabs
            variant="segmented"
            label="Deployment method"
            value={activeTab}
            onChange={setDeploymentMethod}
            tabs={tabs}
          />
        ) : undefined
      }
    >
      {canEdit ? (
        <Stack gap={16}>
          {!isCloud && (
            <Field label="Connection mode" group wide>
              <RadioGroup
                value={connectionMode}
                onValueChange={handleConnectionModeChange}
                aria-label="Connection mode"
              >
                <ConnectionModeChoice
                  value="direct"
                  title="Direct listen"
                  badge="Recommended"
                  description="Infisical opens the connection to the gateway. Choose this when your self-hosted Infisical can reach the gateway's address."
                />
                <ConnectionModeChoice
                  value="relay"
                  title="Relay"
                  description="The gateway opens the connection out to a relay. Choose this when Infisical runs outside the gateway's network, or when inbound connections to it are blocked by NAT or a firewall."
                />
              </RadioGroup>
            </Field>
          )}
          {isDirect && (
            <Field
              label="Listen address"
              description="The host and port Infisical dials."
              error={
                hasListenAddressError
                  ? "Enter a host and port, such as gateway.internal:8443."
                  : undefined
              }
            >
              <Input
                mono
                value={listenAddress}
                invalid={hasListenAddressError}
                placeholder="gateway.internal:8443"
                onChange={(event) => setListenAddress(event.target.value)}
              />
            </Field>
          )}
          {isToken && !enrollment ? (
            <Inline gap={8}>
              <Button
                variant="outline"
                icon="terminal"
                loading={mint.isPending}
                onClick={handleGenerate}
              >
                Generate deploy command
              </Button>
            </Inline>
          ) : (
            commands
          )}
          {isToken && enrollment && (
            <Inline gap={8}>
              <Button
                variant={isCommandDirty ? "primary" : "outline"}
                icon="sync"
                loading={mint.isPending}
                onClick={handleGenerate}
              >
                {isCommandDirty ? "Update command for selected relay" : "Regenerate command"}
              </Button>
            </Inline>
          )}
        </Stack>
      ) : (
        <DeployRestricted resource="gateway" />
      )}
    </Card>
  );
};
