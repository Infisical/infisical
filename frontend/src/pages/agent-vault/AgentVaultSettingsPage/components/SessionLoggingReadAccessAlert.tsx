import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
import {
  useGetAgentVaultActivityLoggingCorsProbe,
  useGetAgentVaultActivityLoggingSettings
} from "@app/hooks/api/agentVault";
import { TAgentVaultActivityReadAccess } from "@app/hooks/api/agentVault/types";

import { AwsSetupDialog } from "./AwsSetupDialog";

const READ_ACCESS_ALERTS: Record<
  Exclude<TAgentVaultActivityReadAccess, "readable">,
  { message: string; action: string }
> = {
  "cors-missing": {
    message:
      "Session logs can't be read back, because the bucket they're stored in isn't allowing requests from this origin.",
    action: "View CORS Rule"
  },
  "access-denied": {
    message:
      "Session logs can't be read back, because the AWS connection isn't allowed to read from the bucket they're stored in.",
    action: "View IAM Policy"
  }
};

export const SessionLoggingReadAccessAlert = () => {
  const [isAwsSetupOpen, setIsAwsSetupOpen] = useState(false);
  const { data: config } = useGetAgentVaultActivityLoggingSettings();
  const { data: readAccess } = useGetAgentVaultActivityLoggingCorsProbe();
  const readAlert = readAccess && readAccess !== "readable" ? READ_ACCESS_ALERTS[readAccess] : null;

  return (
    <>
      {readAlert && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            <p>{readAlert.message}</p>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={() => setIsAwsSetupOpen(true)}>
                {readAlert.action}
              </Button>
            </AlertAction>
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
