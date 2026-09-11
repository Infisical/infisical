import { useRef, useState } from "react";
import { LockKeyholeIcon, RefreshCwIcon, RocketIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrgPermission } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useMintGatewayToken } from "@app/hooks/api/gateways-v2";
import { GatewayAuthMethodView, TGatewayEnrollmentToken } from "@app/hooks/api/gateways-v2/types";

import { AwsStartCommandContent } from "../GatewayAuthMethod/AwsStartCommandDialog";
import { EnrollmentTokenContent } from "../GatewayAuthMethod/EnrollmentTokenDialog";
import { KubernetesStartCommandContent } from "../GatewayAuthMethod/KubernetesStartCommandDialog";

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

type Props = {
  gatewayId: string;
  gatewayName: string;
  directAddress?: string | null;
  relayId?: string | null;
  authMethod: GatewayAuthMethodView;
};

export const GatewayDeploySection = ({
  gatewayId,
  gatewayName,
  directAddress,
  relayId,
  authMethod
}: Props) => {
  const isCloud = isInfisicalCloud();
  const isKubernetes = authMethod.method === "kubernetes";
  // Relay only for Cloud, which cannot route inward, and for a gateway already running relay alone.
  const isRelayOnlyGateway = Boolean(relayId) && !directAddress;
  const [connectionMode, setConnectionMode] = useState<"relay" | "direct">(
    isCloud || isRelayOnlyGateway ? "relay" : "direct"
  );
  const [listenAddress, setListenAddress] = useState(directAddress ?? "");
  const trimmedListenAddress = listenAddress.trim();
  const hasListenAddressError =
    trimmedListenAddress.length > 0 && !isValidListenAddress(trimmedListenAddress);
  // Keep a malformed address out of a copyable command.
  const commandListenAddress = hasListenAddressError ? "" : trimmedListenAddress;
  const [deploymentMethod, setDeploymentMethod] = useState("");
  const [mintedEnrollment, setMintedEnrollment] = useState<
    (TGatewayEnrollmentToken & { gatewayId: string }) | null
  >(null);
  const [isCommandDirty, setIsCommandDirty] = useState(false);
  const mintSequence = useRef(0);
  const { mutateAsync: mint, isPending: isMinting } = useMintGatewayToken();
  const { permission } = useOrgPermission();
  const enrollment = mintedEnrollment?.gatewayId === gatewayId ? mintedEnrollment : null;
  const canEditGateway = permission.can(
    OrgGatewayPermissionActions.EditGateways,
    OrgPermissionSubjects.Gateway
  );

  if (authMethod.method === "identity") return null;

  const showDeploymentControls = authMethod.method === "aws" || isKubernetes || Boolean(enrollment);

  // Derived, so switching auth method can't leave a tab selected that the new method lacks.
  const deploymentTabs = isKubernetes ? ["helm", "cli"] : ["cli", "systemd"];
  const activeTab = deploymentTabs.includes(deploymentMethod)
    ? deploymentMethod
    : deploymentTabs[0];

  const handleGenerate = async () => {
    const sequence = mintSequence.current + 1;
    mintSequence.current = sequence;
    try {
      const result = await mint({ gatewayId });
      // Minting deletes the previous token, so a slower earlier response would show a dead one.
      if (mintSequence.current !== sequence) return;
      setMintedEnrollment({ ...result, gatewayId });
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  const handleConnectionModeChange = (value: string) => {
    const nextMode = value as "relay" | "direct";
    if (nextMode === connectionMode) return;
    setConnectionMode(nextMode);
    // The command rewrites its flags on mode change, and enrollment tokens are single use.
    if (enrollment) void handleGenerate();
  };

  return (
    <Tabs value={activeTab} onValueChange={setDeploymentMethod} className="min-w-0">
      <Card className="min-w-0" aria-labelledby="gateway-deployment-title">
        <CardHeader>
          <CardTitle>
            <h2 id="gateway-deployment-title">Deployment</h2>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/gateways/gateway-deployment" />
          </CardTitle>
          <CardDescription>
            {isKubernetes
              ? "Run this gateway in your Kubernetes cluster."
              : "Run this gateway on a target host."}
          </CardDescription>
          {canEditGateway && showDeploymentControls && (
            <CardAction>
              <TabsList variant="filled" aria-label="Deployment method">
                {isKubernetes ? (
                  <>
                    <TabsTrigger value="helm">Helm</TabsTrigger>
                    <TabsTrigger value="cli">Container command</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="cli">CLI</TabsTrigger>
                    <TabsTrigger value="systemd">System service</TabsTrigger>
                  </>
                )}
              </TabsList>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!canEditGateway ? (
            <Alert variant="warning" appearance="borderless">
              <LockKeyholeIcon />
              <AlertTitle>Access restricted</AlertTitle>
              <AlertDescription>
                You don&apos;t have permission to generate gateway deployment commands.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {!isCloud && (
                <Field>
                  <FieldLabel>Connection Mode</FieldLabel>
                  <RadioGroup value={connectionMode} onValueChange={handleConnectionModeChange}>
                    <FieldLabel htmlFor="gateway-connection-mode-direct" variant="org">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>
                            Direct Listen
                            <Badge variant="org">Recommended</Badge>
                          </FieldTitle>
                          <FieldDescription>
                            Infisical opens the connection to the gateway. Choose this when your
                            self-hosted Infisical can reach the gateway&apos;s address.
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value="direct" id="gateway-connection-mode-direct" />
                      </Field>
                    </FieldLabel>
                    <FieldLabel htmlFor="gateway-connection-mode-relay" variant="org">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>Relay</FieldTitle>
                          <FieldDescription>
                            The gateway opens the connection out to a relay. Choose this when
                            Infisical runs outside the gateway&apos;s network, or when inbound
                            connections to it are blocked by NAT or a firewall.
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value="relay" id="gateway-connection-mode-relay" />
                      </Field>
                    </FieldLabel>
                  </RadioGroup>
                </Field>
              )}

              {connectionMode === "direct" && (
                <Field data-invalid={hasListenAddressError}>
                  <FieldLabel htmlFor="gateway-listen-address">Listen Address</FieldLabel>
                  <Input
                    id="gateway-listen-address"
                    value={listenAddress}
                    onChange={(event) => setListenAddress(event.target.value)}
                    placeholder="gateway.internal:8443"
                    isError={hasListenAddressError}
                  />
                  <FieldDescription>The host and port Infisical dials.</FieldDescription>
                  <FieldError isOpen={hasListenAddressError}>
                    Enter a host and port, such as gateway.internal:8443.
                  </FieldError>
                </Field>
              )}

              {authMethod.method === "aws" && (
                <AwsStartCommandContent
                  gatewayId={gatewayId}
                  gatewayName={gatewayName}
                  isDirect={connectionMode === "direct"}
                  listenAddress={commandListenAddress}
                />
              )}

              {isKubernetes && (
                <KubernetesStartCommandContent
                  gatewayId={gatewayId}
                  gatewayName={gatewayName}
                  isDirect={connectionMode === "direct"}
                  listenAddress={commandListenAddress}
                />
              )}

              {authMethod.method === "token" && !enrollment && (
                <Button
                  variant="neutral"
                  size="sm"
                  isPending={isMinting}
                  isDisabled={isMinting}
                  onClick={handleGenerate}
                >
                  <RocketIcon className="size-4" />
                  Generate deploy command
                </Button>
              )}

              {authMethod.method === "token" && enrollment && (
                <>
                  <EnrollmentTokenContent
                    gatewayName={gatewayName}
                    enrollmentToken={enrollment.token}
                    expiresAt={enrollment.expiresAt}
                    isDirect={connectionMode === "direct"}
                    listenAddress={commandListenAddress}
                    onCommandDirtyChange={setIsCommandDirty}
                  />
                  <Button
                    variant={isCommandDirty ? "warning" : "neutral"}
                    size="sm"
                    isPending={isMinting}
                    isDisabled={isMinting}
                    onClick={handleGenerate}
                  >
                    <RefreshCwIcon className="size-4" />
                    {isCommandDirty ? "Update command for selected relay" : "Regenerate command"}
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Tabs>
  );
};
