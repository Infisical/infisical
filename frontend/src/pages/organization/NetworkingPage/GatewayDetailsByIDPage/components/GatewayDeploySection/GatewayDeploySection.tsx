import { useState } from "react";
import { RefreshCwIcon, RocketIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v3";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useMintGatewayToken } from "@app/hooks/api/gateways-v2";
import { GatewayAuthMethodView, TGatewayEnrollmentToken } from "@app/hooks/api/gateways-v2/types";

import { AwsStartCommandContent } from "../GatewayAuthMethod/AwsStartCommandDialog";
import { EnrollmentTokenContent } from "../GatewayAuthMethod/EnrollmentTokenDialog";

type Props = {
  gatewayId: string;
  gatewayName: string;
  authMethod: GatewayAuthMethodView;
};

export const GatewayDeploySection = ({ gatewayId, gatewayName, authMethod }: Props) => {
  const [enrollment, setEnrollment] = useState<TGatewayEnrollmentToken | null>(null);
  const { mutateAsync: mint, isPending: isMinting } = useMintGatewayToken();

  if (authMethod.method === "identity") return null;

  const handleGenerate = async () => {
    try {
      setEnrollment(await mint({ gatewayId }));
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  return (
    <section className="min-w-0 space-y-4" aria-label="Gateway deployment">
      {authMethod.method === "token" && !enrollment && (
        <div>
          <h2 className="text-base font-medium text-foreground">Deployment</h2>
          <p className="mt-1 text-sm text-muted">Run this gateway on a target host.</p>
        </div>
      )}

      {authMethod.method === "aws" && (
        <AwsStartCommandContent gatewayId={gatewayId} gatewayName={gatewayName} />
      )}

      {authMethod.method === "token" && !enrollment && (
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.EditGateways}
          a={OrgPermissionSubjects.Gateway}
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
          <EnrollmentTokenContent
            gatewayName={gatewayName}
            enrollmentToken={enrollment.token}
            expiresAt={enrollment.expiresAt}
          />
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.EditGateways}
            a={OrgPermissionSubjects.Gateway}
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
    </section>
  );
};
