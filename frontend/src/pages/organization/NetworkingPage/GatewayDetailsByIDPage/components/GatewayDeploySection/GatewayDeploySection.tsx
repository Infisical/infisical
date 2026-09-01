import { useState } from "react";
import { LockKeyholeIcon, RefreshCwIcon, RocketIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrgPermission } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useMintGatewayToken } from "@app/hooks/api/gateways-v2";
import { GatewayAuthMethodView, TGatewayEnrollmentToken } from "@app/hooks/api/gateways-v2/types";

import { AwsStartCommandContent } from "../GatewayAuthMethod/AwsStartCommandDialog";
import { EnrollmentTokenContent } from "../GatewayAuthMethod/EnrollmentTokenDialog";
import { KubernetesStartCommandContent } from "../GatewayAuthMethod/KubernetesStartCommandDialog";

type Props = {
  gatewayId: string;
  gatewayName: string;
  authMethod: GatewayAuthMethodView;
};

export const GatewayDeploySection = ({ gatewayId, gatewayName, authMethod }: Props) => {
  const isKubernetes = authMethod.method === "kubernetes";
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
              {authMethod.method === "aws" && (
                <AwsStartCommandContent gatewayId={gatewayId} gatewayName={gatewayName} />
              )}

              {isKubernetes && (
                <KubernetesStartCommandContent gatewayId={gatewayId} gatewayName={gatewayName} />
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
