import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";

import { useProjectScope } from "../../../access/project/scope";
import { orgHref } from "../../../links";

const COPY: Record<AgentVaultSessionLogStorageType, { title: string; description: string }> = {
  [AgentVaultSessionLogStorageType.Default]: {
    title: "Upgrade to use default storage",
    description: "Your plan doesn't include default storage for session logs."
  },
  [AgentVaultSessionLogStorageType.External]: {
    title: "Upgrade to use external storage",
    description: "Your plan doesn't include storing session logs in your own S3 bucket."
  }
};

export const UpgradeDialog = ({
  storageType,
  onClose
}: {
  storageType: AgentVaultSessionLogStorageType | null;
  onClose: () => void;
}) => {
  const { orgId } = useProjectScope();
  const copy = COPY[storageType ?? AgentVaultSessionLogStorageType.External];
  return (
    <AlertDialog open={storageType !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button asChild>
            <a href={orgHref(orgId, "/billing")}>View plans</a>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
