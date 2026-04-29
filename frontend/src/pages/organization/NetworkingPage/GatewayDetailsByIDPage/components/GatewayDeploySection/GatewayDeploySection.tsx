import { useState } from "react";

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
  // True when the gateway has no heartbeat — either never connected, or its access was
  // just revoked (which clears heartbeat). Used to highlight the "Show start command"
  // button so the operator sees it as the next step.
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

  // Identity-bound gateways are legacy state — no actions surfaced here. The operator
  // should switch to AWS or Token via the Authentication card before deploying anew.
  if (authMethod.method === "identity") return null;

  // Token-method click mints a fresh single-use enrollment token (1h expiry); AWS-method
  // click just opens the dialog (no token to issue — auth happens via SigV4).
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
                    Show start command
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
