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
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useGenerateKmipServerEnrollmentToken } from "@app/hooks/api/kmipServers";
import { TKmipServerAuthMethodView } from "@app/hooks/api/kmipServers/types";

import { KmipServerDeployCommandDialog } from "./KmipServerDeployCommandDialog";

type Props = {
  kmipServerId: string;
  kmipServerName: string;
  authMethod: TKmipServerAuthMethodView;
  isFirstTimeSetup: boolean;
};

export const KmipServerDeploySection = ({
  kmipServerId,
  kmipServerName,
  authMethod,
  isFirstTimeSetup
}: Props) => {
  const { isSubOrganization } = useOrganization();
  const [showDialog, setShowDialog] = useState(false);
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);
  const { mutateAsync: mint, isPending: isMinting } = useGenerateKmipServerEnrollmentToken();

  if (authMethod.method === "identity") return null;

  const handleClick = async () => {
    if (authMethod.method === "token") {
      try {
        const result = await mint({ kmipServerId });
        setEnrollmentToken(result.token);
        setShowDialog(true);
      } catch {
        createNotification({ type: "error", text: "Failed to generate enrollment token" });
      }
    } else {
      setShowDialog(true);
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Deployment</CardTitle>
          <CardDescription>Launch this KMIP server on a target host</CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgKmipServerPermissionActions.EditKmipServers}
              a={OrgPermissionSubjects.KmipServer}
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

      {showDialog && (
        <KmipServerDeployCommandDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) {
              setShowDialog(false);
              setEnrollmentToken(null);
            }
          }}
          kmipServerId={kmipServerId}
          kmipServerName={kmipServerName}
          authMethod={authMethod.method as "token" | "aws"}
          enrollmentToken={enrollmentToken}
        />
      )}
    </>
  );
};
