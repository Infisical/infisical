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
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useGenerateKmipServerEnrollmentToken } from "@app/hooks/api/kmipServers";
import { TKmipServerAuthMethodView } from "@app/hooks/api/kmipServers/types";

import { AwsStartCommandContent } from "./AwsStartCommandContent";
import { EnrollmentTokenContent } from "./EnrollmentTokenContent";

const DEPLOYMENT_TABS = ["cli", "systemd"];

export const KmipServerDeploySection = ({ kmipServerId, kmipServerName, authMethod }: Props) => {
  const [deploymentMethod, setDeploymentMethod] = useState("");
  const [mintedEnrollment, setMintedEnrollment] = useState<MintedEnrollment | null>(null);
  const { mutateAsync: mint, isPending: isMinting } = useGenerateKmipServerEnrollmentToken();
  const { permission } = useOrgPermission();
  const enrollment = mintedEnrollment?.kmipServerId === kmipServerId ? mintedEnrollment : null;
  const canEditKmipServer = permission.can(
    OrgKmipServerPermissionActions.EditKmipServers,
    OrgPermissionSubjects.KmipServer
  );

  if (authMethod.method === "identity") return null;

  const showDeploymentControls = authMethod.method === "aws" || Boolean(enrollment);
  const activeTab = DEPLOYMENT_TABS.includes(deploymentMethod)
    ? deploymentMethod
    : DEPLOYMENT_TABS[0];

  const handleGenerate = async () => {
    try {
      const result = await mint({ kmipServerId });
      setMintedEnrollment({ ...result, kmipServerId });
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={setDeploymentMethod} className="min-w-0">
      <Card className="min-w-0" aria-labelledby="kmip-server-deployment-title">
        <CardHeader>
          <CardTitle>
            <h2 id="kmip-server-deployment-title">Deployment</h2>
            <DocumentationLinkBadge href="https://infisical.com/docs/cli/overview" />
          </CardTitle>
          <CardDescription>Run this KMIP server on a target host.</CardDescription>
          {canEditKmipServer && showDeploymentControls && (
            <CardAction>
              <TabsList variant="filled" aria-label="Deployment method">
                <TabsTrigger value="cli">CLI</TabsTrigger>
                <TabsTrigger value="systemd">System Service</TabsTrigger>
              </TabsList>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!canEditKmipServer ? (
            <Alert variant="warning" appearance="borderless">
              <LockKeyholeIcon />
              <AlertTitle>Access restricted</AlertTitle>
              <AlertDescription>
                You don&apos;t have permission to generate KMIP server deployment commands.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {authMethod.method === "aws" && (
                <AwsStartCommandContent
                  kmipServerId={kmipServerId}
                  kmipServerName={kmipServerName}
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
                  <RocketIcon />
                  Generate Deploy Command
                </Button>
              )}

              {authMethod.method === "token" && enrollment && (
                <>
                  <EnrollmentTokenContent
                    kmipServerName={kmipServerName}
                    enrollmentToken={enrollment.token}
                    expiresAt={enrollment.expiresAt}
                  />
                  <Button
                    variant="neutral"
                    size="sm"
                    isPending={isMinting}
                    isDisabled={isMinting}
                    onClick={handleGenerate}
                  >
                    <RefreshCwIcon />
                    Regenerate Command
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

type Props = {
  kmipServerId: string;
  kmipServerName: string;
  authMethod: TKmipServerAuthMethodView;
};

type MintedEnrollment = { token: string; expiresAt: string; kmipServerId: string };
