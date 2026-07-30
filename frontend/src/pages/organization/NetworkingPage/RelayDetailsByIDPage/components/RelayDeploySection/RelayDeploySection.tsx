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
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { useGenerateRelayEnrollmentToken } from "@app/hooks/api/relays";
import { TRelayAuthMethodView } from "@app/hooks/api/relays/types";

import { RelayDeployCommandContent } from "./RelayDeployCommandDialog";

type Props = {
  relayId: string;
  relayName: string;
  authMethod: TRelayAuthMethodView;
};

type Enrollment = { token: string; expiresAt: string; relayId: string };

export const RelayDeploySection = ({ relayId, relayName, authMethod }: Props) => {
  const [deploymentMethod, setDeploymentMethod] = useState("cli");
  const [mintedEnrollment, setMintedEnrollment] = useState<Enrollment | null>(null);
  const { mutateAsync: mint, isPending: isMinting } = useGenerateRelayEnrollmentToken();
  const { permission } = useOrgPermission();
  const enrollment = mintedEnrollment?.relayId === relayId ? mintedEnrollment : null;
  const canEditRelay = permission.can(
    OrgRelayPermissionActions.EditRelays,
    OrgPermissionSubjects.Relay
  );

  if (authMethod.method === "identity") return null;

  const showDeploymentControls = authMethod.method === "aws" || Boolean(enrollment);

  const handleGenerate = async () => {
    try {
      const result = await mint({ relayId });
      setMintedEnrollment({ ...result, relayId });
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  return (
    <Tabs value={deploymentMethod} onValueChange={setDeploymentMethod} className="min-w-0">
      <Card className="min-w-0" aria-labelledby="relay-deployment-title">
        <CardHeader>
          <CardTitle>
            <h2 id="relay-deployment-title">Deployment</h2>
            <DocumentationLinkBadge href="https://infisical.com/docs/cli/overview" />
          </CardTitle>
          <CardDescription>Run this relay on a target host.</CardDescription>
          {canEditRelay && showDeploymentControls && (
            <CardAction>
              <TabsList variant="filled">
                <TabsTrigger value="cli">CLI</TabsTrigger>
                <TabsTrigger value="systemd">System service</TabsTrigger>
              </TabsList>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!canEditRelay ? (
            <Alert>
              <LockKeyholeIcon />
              <AlertTitle>Access restricted</AlertTitle>
              <AlertDescription>
                You don&apos;t have permission to generate relay deployment commands.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {authMethod.method === "aws" && (
                <RelayDeployCommandContent
                  relayId={relayId}
                  relayName={relayName}
                  authMethod="aws"
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
                  <RelayDeployCommandContent
                    relayId={relayId}
                    relayName={relayName}
                    authMethod="token"
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
                    <RefreshCwIcon className="size-4" />
                    Regenerate command
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
