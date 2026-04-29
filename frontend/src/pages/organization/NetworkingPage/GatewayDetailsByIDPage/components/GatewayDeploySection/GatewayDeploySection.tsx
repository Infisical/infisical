import { useState } from "react";

import { OrgPermissionCan } from "@app/components/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { GatewayAuthMethodView } from "@app/hooks/api/gateways-v2/types";

import { AwsStartCommandDialog } from "../GatewayAuthenticationSection/AwsStartCommandDialog";
import { GatewayDeployAwsContent } from "./GatewayDeployAwsContent";
import { GatewayDeployTokenContent } from "./GatewayDeployTokenContent";

type Props = {
  gatewayId: string;
  gatewayName: string;
  authMethod: GatewayAuthMethodView;
  // tokenVersion > 0 ⇒ a JWT may exist for this gateway. We use that as the universal
  // signal for "Revoke is meaningful here" across both AWS and Token methods.
  canRevoke: boolean;
};

export const GatewayDeploySection = ({ gatewayId, gatewayName, authMethod, canRevoke }: Props) => {
  const [showAwsCommand, setShowAwsCommand] = useState(false);

  // Identity-bound gateways are legacy state — no actions surfaced here. The operator
  // should switch to AWS or Token via the Authentication card before deploying anew.
  if (authMethod.method === "identity") return null;

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>Deployment</CardTitle>
          <CardDescription>Launch this gateway on a target host</CardDescription>
        </CardHeader>
        <CardContent>
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.EditGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <OrgPermissionCan
                I={OrgGatewayPermissionActions.RevokeGatewayAccess}
                a={OrgPermissionSubjects.Gateway}
              >
                {(isAllowedToRevoke) => {
                  if (authMethod.method === "aws") {
                    return (
                      <GatewayDeployAwsContent
                        gatewayId={gatewayId}
                        canRevoke={canRevoke}
                        isAllowed={isAllowed}
                        isAllowedToRevoke={isAllowedToRevoke}
                        onShowCommand={() => setShowAwsCommand(true)}
                      />
                    );
                  }
                  return (
                    <GatewayDeployTokenContent
                      gatewayId={gatewayId}
                      gatewayName={gatewayName}
                      canRevoke={canRevoke}
                      isAllowed={isAllowed}
                      isAllowedToRevoke={isAllowedToRevoke}
                    />
                  );
                }}
              </OrgPermissionCan>
            )}
          </OrgPermissionCan>
        </CardContent>
      </Card>

      {authMethod.method === "aws" && (
        <AwsStartCommandDialog
          isOpen={showAwsCommand}
          onOpenChange={setShowAwsCommand}
          gatewayId={gatewayId}
          gatewayName={gatewayName}
        />
      )}
    </>
  );
};
