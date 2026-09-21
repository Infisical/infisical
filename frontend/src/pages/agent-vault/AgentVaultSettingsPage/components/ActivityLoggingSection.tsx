import { useState } from "react";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { useGetAgentVaultActivityConfig } from "@app/hooks/api/agentVault";

import { ActivityLoggingSheet } from "./ActivityLoggingSheet";

export const ActivityLoggingSection = () => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { data, isPending } = useGetAgentVaultActivityConfig();

  const usage = data?.usage;
  const usageRatio = usage && usage.ceiling > 0 ? usage.storedRecordCount / usage.ceiling : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Activity Logging</CardTitle>
          <CardDescription>
            Record every request an agent makes through a proxy: the method, host, path and result.
            Records are encrypted and stored in a bucket you own. Infisical keeps only an index.
          </CardDescription>
          <CardAction>
            <Button variant="av" isDisabled={isPending} onClick={() => setIsSheetOpen(true)}>
              {data?.config.bucket ? "Configure" : "Set up"}
            </Button>
          </CardAction>
        </CardHeader>

        {/* The limit is the one thing that cannot wait behind a button: at the cap nothing is being
            recorded, and an admin who never opens the sheet would not know. */}
        {usageRatio >= 0.8 && (
          <CardContent>
            <Alert variant={usageRatio >= 1 ? "danger" : "warning"}>
              <AlertDescription>
                {usageRatio >= 1
                  ? "This organization is at its activity storage limit. Nothing new is being recorded until older sessions are deleted or the limit is raised."
                  : "This organization is close to its activity storage limit. Recording stops when it is reached."}
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      <ActivityLoggingSheet isOpen={isSheetOpen} onOpenChange={setIsSheetOpen} />
    </>
  );
};
