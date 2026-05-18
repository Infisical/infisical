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
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { useGenerateRelayEnrollmentToken } from "@app/hooks/api/relays";
import { TRelayAuthMethodView } from "@app/hooks/api/relays/types";

import { RelayEnrollmentTokenDialog } from "./RelayEnrollmentTokenDialog";

type Props = {
  relayId: string;
  relayName: string;
  authMethod: TRelayAuthMethodView;
  isFirstTimeSetup: boolean;
};

export const RelayDeploySection = ({ relayId, relayName, authMethod, isFirstTimeSetup }: Props) => {
  const { isSubOrganization } = useOrganization();
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);
  const { mutateAsync: mint, isPending: isMinting } = useGenerateRelayEnrollmentToken();

  if (authMethod.method === "identity") return null;

  const handleClick = async () => {
    if (authMethod.method === "aws") {
      // TODO: AWS start command dialog for relays
      createNotification({ type: "info", text: "AWS deploy command not yet implemented" });
      return;
    }
    try {
      const result = await mint({ relayId });
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
          <CardDescription>Launch this relay on a target host</CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgRelayPermissionActions.EditRelays}
              a={OrgPermissionSubjects.Relay}
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

      {enrollmentToken && (
        <RelayEnrollmentTokenDialog
          isOpen
          onOpenChange={(open) => !open && setEnrollmentToken(null)}
          relayName={relayName}
          enrollmentToken={enrollmentToken}
        />
      )}
    </>
  );
};
