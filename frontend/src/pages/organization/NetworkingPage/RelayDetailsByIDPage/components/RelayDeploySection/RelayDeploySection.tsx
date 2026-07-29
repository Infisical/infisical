import { useState } from "react";
import { RefreshCwIcon, RocketIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
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
  const enrollment = mintedEnrollment?.relayId === relayId ? mintedEnrollment : null;

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
          {showDeploymentControls && (
            <CardAction>
              <TabsList variant="filled">
                <TabsTrigger value="cli">CLI</TabsTrigger>
                <TabsTrigger value="systemd">System service</TabsTrigger>
              </TabsList>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {authMethod.method === "aws" && (
            <OrgPermissionCan
              I={OrgRelayPermissionActions.EditRelays}
              a={OrgPermissionSubjects.Relay}
            >
              <RelayDeployCommandContent relayId={relayId} relayName={relayName} authMethod="aws" />
            </OrgPermissionCan>
          )}

          {authMethod.method === "token" && !enrollment && (
            <OrgPermissionCan
              I={OrgRelayPermissionActions.EditRelays}
              a={OrgPermissionSubjects.Relay}
            >
              {(isAllowed) => (
                <Button
                  variant="neutral"
                  size="sm"
                  isPending={isMinting}
                  isDisabled={!isAllowed || isMinting}
                  onClick={handleGenerate}
                >
                  <RocketIcon className="size-4" />
                  Generate deploy command
                </Button>
              )}
            </OrgPermissionCan>
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
              <OrgPermissionCan
                I={OrgRelayPermissionActions.EditRelays}
                a={OrgPermissionSubjects.Relay}
              >
                {(isAllowed) => (
                  <Button
                    variant="neutral"
                    size="sm"
                    isPending={isMinting}
                    isDisabled={!isAllowed || isMinting}
                    onClick={handleGenerate}
                  >
                    <RefreshCwIcon className="size-4" />
                    Regenerate command
                  </Button>
                )}
              </OrgPermissionCan>
            </>
          )}
        </CardContent>
      </Card>
    </Tabs>
  );
};
