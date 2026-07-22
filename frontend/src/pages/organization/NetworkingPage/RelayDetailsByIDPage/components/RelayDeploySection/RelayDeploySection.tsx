import { useState } from "react";
import { RefreshCwIcon, RocketIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v3";
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

type Enrollment = { token: string; expiresAt: string };

export const RelayDeploySection = ({ relayId, relayName, authMethod }: Props) => {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const { mutateAsync: mint, isPending: isMinting } = useGenerateRelayEnrollmentToken();

  if (authMethod.method === "identity") return null;

  const handleGenerate = async () => {
    try {
      setEnrollment(await mint({ relayId }));
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  return (
    <section className="min-w-0 space-y-4" aria-label="Relay deployment">
      {authMethod.method === "token" && !enrollment && (
        <div>
          <h2 className="text-base font-medium text-foreground">Deployment</h2>
          <p className="mt-1 text-sm text-muted">Run this relay on a target host.</p>
        </div>
      )}

      {authMethod.method === "aws" && (
        <RelayDeployCommandContent relayId={relayId} relayName={relayName} authMethod="aws" />
      )}

      {authMethod.method === "token" && !enrollment && (
        <OrgPermissionCan I={OrgRelayPermissionActions.EditRelays} a={OrgPermissionSubjects.Relay}>
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
    </section>
  );
};
