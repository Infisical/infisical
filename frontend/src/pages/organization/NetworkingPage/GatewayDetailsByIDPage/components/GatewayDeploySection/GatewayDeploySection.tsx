import { useState } from "react";
import { RocketIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useMintGatewayToken } from "@app/hooks/api/gateways-v2";
import { GatewayAuthMethodView } from "@app/hooks/api/gateways-v2/types";

import { AwsStartCommandDialog } from "../GatewayAuthMethod/AwsStartCommandDialog";
import { EnrollmentTokenDialog } from "../GatewayAuthMethod/EnrollmentTokenDialog";

type Props = {
  gatewayId: string;
  gatewayName: string;
  authMethod: GatewayAuthMethodView;
  // True when the gateway has no heartbeat — drives highlighting the start-command button.
  isFirstTimeSetup: boolean;
};

export const GatewayDeploySection = ({
  gatewayId,
  gatewayName,
  authMethod,
  isFirstTimeSetup
}: Props) => {
  const { isSubOrganization } = useOrganization();
  const [showAwsCommand, setShowAwsCommand] = useState(false);
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);
  const { mutateAsync: mint, isPending: isMinting } = useMintGatewayToken();

  if (authMethod.method === "identity") return null;

  const handleClick = async () => {
    if (authMethod.method === "aws") {
      setShowAwsCommand(true);
      return;
    }
    try {
      const result = await mint({ gatewayId });
      setEnrollmentToken(result.token);
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Deployment</CardTitle>
          <CardDescription>Launch this gateway on a target host</CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgGatewayPermissionActions.EditGateways}
              a={OrgPermissionSubjects.Gateway}
            >
              {(isAllowed) => {
                let variant: "neutral" | "org" | "sub-org" = "neutral";
                if (isFirstTimeSetup) variant = isSubOrganization ? "sub-org" : "org";
                return (
                  <Button
                    variant={variant}
                    size="sm"
                    isPending={isMinting}
                    isDisabled={!isAllowed || isMinting}
                    onClick={handleClick}
                  >
                    <RocketIcon className="size-4" />
                    Show deploy command
                  </Button>
                );
              }}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
      </Card>

      {authMethod.method === "aws" && (
        <AwsStartCommandDialog
          isOpen={showAwsCommand}
          onOpenChange={setShowAwsCommand}
          gatewayId={gatewayId}
          gatewayName={gatewayName}
        />
      )}

      {enrollmentToken && (
        <EnrollmentTokenDialog
          isOpen
          onOpenChange={(open) => !open && setEnrollmentToken(null)}
          gatewayName={gatewayName}
          enrollmentToken={enrollmentToken}
        />
      )}
    </>
  );
};
