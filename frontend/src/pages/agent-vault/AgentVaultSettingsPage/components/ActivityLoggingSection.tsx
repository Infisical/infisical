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

        {/* Recording having stopped cannot wait behind a button: an admin who never opens the sheet
            would otherwise find out from the gap in a timeline. */}
        {data?.isStorageFull && (
          <CardContent>
            <Alert variant="danger">
              <AlertDescription>
                Activity storage for this organization is full, and nothing new is being recorded.
                Contact Infisical support.
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      <ActivityLoggingSheet isOpen={isSheetOpen} onOpenChange={setIsSheetOpen} />
    </>
  );
};
