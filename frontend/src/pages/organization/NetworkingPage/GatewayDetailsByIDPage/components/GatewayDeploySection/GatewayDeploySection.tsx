import { useState } from "react";
import { InfoIcon, LockKeyholeIcon, RefreshCwIcon, RocketIcon } from "lucide-react";

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
  Checkbox,
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
  // Relay unless the gateway already listens directly. Defaulting to direct on a gateway with no
  // address yet would render a command carrying the placeholder address.
  const isDirectGateway = !isCloud && Boolean(directAddress);
  const [connectionMode, setConnectionMode] = useState<"relay" | "direct">(
    isDirectGateway ? "direct" : "relay"
  );
  // The relay is an add-on to direct listen rather than a competing transport: it extends reach to
  // PAM CLI users off the network and covers the direct address going down. Pre-checked for a
  // gateway already running both, so the command it renders matches how it is deployed.
  const [withRelay, setWithRelay] = useState(isDirectGateway && Boolean(relayId));
  const includeRelay = connectionMode === "relay" || withRelay;
  const [listenAddress, setListenAddress] = useState(directAddress ?? "");
  const trimmedListenAddress = listenAddress.trim();
  const hasListenAddressError =
    trimmedListenAddress.length > 0 && !isValidListenAddress(trimmedListenAddress);
  // A malformed address must not reach a copyable command, where it would fail against the API
  // rather than in the field the user can see.
  const commandListenAddress = hasListenAddressError ? "" : trimmedListenAddress;
  const [deploymentMethod, setDeploymentMethod] = useState("");
  const [mintedEnrollment, setMintedEnrollment] = useState<
    (TGatewayEnrollmentToken & { gatewayId: string }) | null
  >(null);
  const [isCommandDirty, setIsCommandDirty] = useState(false);
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
    try {
      const result = await mint({ gatewayId });
      setMintedEnrollment({ ...result, gatewayId });
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={setDeploymentMethod} className="min-w-0">
      <Card className="min-w-0" aria-labelledby="gateway-deployment-title">
        <CardHeader>
          <CardTitle>
            <h2 id="gateway-deployment-title">Deployment</h2>
            <DocumentationLinkBadge href="https://infisical.com/docs/cli/overview" />
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
                  <FieldDescription className="-mt-1 mb-1">
                    Pick which side opens the connection. Both use the same mutually authenticated
                    TLS.
                  </FieldDescription>
                  <RadioGroup
                    value={connectionMode}
                    onValueChange={(value) => setConnectionMode(value as "relay" | "direct")}
                  >
                    <FieldLabel htmlFor="gateway-connection-mode-direct" variant="org">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>
                            Direct Listen
                            <Badge variant="org">Recommended</Badge>
                          </FieldTitle>
                          <FieldDescription>
                            Infisical opens the connection to the gateway. Choose this when the
                            gateway has a stable address Infisical can reach, with no relay to
                            deploy.
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
                            inbound connections to the gateway are blocked by NAT or a firewall.
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
                  <FieldDescription>
                    The host and port Infisical dials. The gateway binds this port on every
                    interface.
                  </FieldDescription>
                  <FieldError isOpen={hasListenAddressError}>
                    Enter a host and port, such as gateway.internal:8443.
                  </FieldError>
                </Field>
              )}

              {connectionMode === "direct" && (
                <Field>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="gateway-with-relay"
                      variant="org"
                      className="mt-0.5"
                      isChecked={withRelay}
                      onCheckedChange={(isChecked) => setWithRelay(isChecked === true)}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor="gateway-with-relay" className="cursor-pointer">
                        Also connect through a relay
                      </FieldLabel>
                      <FieldDescription>
                        Infisical keeps using the direct address and falls back to the relay when it
                        stops answering. Add one to reach PAM CLI users outside this network.
                      </FieldDescription>
                    </FieldContent>
                  </div>
                </Field>
              )}

              {connectionMode === "direct" && (
                <Alert variant="info" appearance="borderless">
                  <InfoIcon />
                  {withRelay ? (
                    <>
                      <AlertTitle>PAM CLI sessions work from outside this network</AlertTitle>
                      <AlertDescription>
                        The CLI dials the gateway from the user&apos;s own machine. It tries this
                        address first and falls back to the relay, so users off this network can
                        still connect. Infisical itself keeps using the direct address.
                      </AlertDescription>
                    </>
                  ) : (
                    <>
                      <AlertTitle>PAM CLI sessions dial this address directly</AlertTitle>
                      <AlertDescription>
                        The CLI connects from the user&apos;s own machine, not from Infisical, so
                        that machine has to reach this address as well. Users outside this network
                        need a VPN into it, or the relay option above. Browser-based PAM access is
                        unaffected.
                      </AlertDescription>
                    </>
                  )}
                </Alert>
              )}

              {authMethod.method === "aws" && (
                <AwsStartCommandContent
                  gatewayId={gatewayId}
                  gatewayName={gatewayName}
                  isDirect={connectionMode === "direct"}
                  includeRelay={includeRelay}
                  listenAddress={commandListenAddress}
                />
              )}

              {isKubernetes && (
                <KubernetesStartCommandContent
                  gatewayId={gatewayId}
                  gatewayName={gatewayName}
                  isDirect={connectionMode === "direct"}
                  includeRelay={includeRelay}
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
                    includeRelay={includeRelay}
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
