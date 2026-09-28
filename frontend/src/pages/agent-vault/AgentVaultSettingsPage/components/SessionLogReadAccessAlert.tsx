import { ReactNode, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
import {
  useGetAgentVaultSessionLogCorsProbe,
  useGetAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault";
import { TAgentVaultSessionLogReadAccess } from "@app/hooks/api/agentVault/types";

import { AwsSetupDialog, HostBlockedMessage } from "./AwsSetupDialog";

const READ_ACCESS_ALERTS: Record<
  Exclude<TAgentVaultSessionLogReadAccess, "readable">,
  { message: (host: string) => ReactNode; action?: string }
> = {
  "cors-missing": {
    message: () =>
      "Session logs can't be read back, because the bucket they're stored in isn't allowing requests from this origin.",
    action: "View CORS Rule"
  },
  "access-denied": {
    message: () =>
      "Session logs can't be read back, because the AWS connection isn't allowed to read from the bucket they're stored in.",
    action: "View IAM Policy"
  },
  "host-blocked": {
    message: (host) => <HostBlockedMessage host={host} />
  }
};

export const SessionLogReadAccessAlert = () => {
  const [isAwsSetupOpen, setIsAwsSetupOpen] = useState(false);
  const { data: config } = useGetAgentVaultSessionLogSettings();
  const { data: readCheck } = useGetAgentVaultSessionLogCorsProbe();
  const readAlert =
    readCheck && readCheck.status !== "readable" ? READ_ACCESS_ALERTS[readCheck.status] : null;

  return (
    <>
      {readAlert && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            <p>{readAlert.message(readCheck?.host ?? "")}</p>
            {readAlert.action && (
              <AlertAction>
                <Button variant="outline" size="sm" onClick={() => setIsAwsSetupOpen(true)}>
                  {readAlert.action}
                </Button>
              </AlertAction>
            )}
          </AlertDescription>
        </Alert>
      )}

      <AwsSetupDialog
        isOpen={isAwsSetupOpen}
        onOpenChange={setIsAwsSetupOpen}
        bucket={config?.bucket ?? null}
        keyPrefix={config?.keyPrefix ?? null}
      />
    </>
  );
};
