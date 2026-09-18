import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { useAssumeProjectPrivileges } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";

const CONFIRM_KEY = "assume";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  actorType: ActorType;
  actorId?: string;
};

export const AssumePrivilegesDialog = ({ isOpen, onOpenChange, actorType, actorId }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const assumePrivileges = useAssumeProjectPrivileges();

  const isUser = actorType === ActorType.USER;
  const noun = isUser ? "user" : "machine identity";
  const isActionDisabled = !actorId || !currentOrg?.id || !currentProject?.id;

  const handleConfirm = () => {
    if (!actorId || !currentOrg?.id || !currentProject?.id || assumePrivileges.isPending) return;

    assumePrivileges.mutate(
      {
        actorId,
        actorType,
        projectId: currentProject.id
      },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: `${isUser ? "User" : "Machine identity"} privilege assumption has started`
          });

          const url = getProjectHomePage(currentProject.type, currentProject.environments);
          window.location.assign(
            url.replace("$orgId", currentOrg.id).replace("$projectId", currentProject.id)
          );
        }
      }
    );
  };

  return (
    <AlertDialog
      open={isOpen}
      confirmationValue={CONFIRM_KEY}
      onOpenChange={(open) => {
        if (!assumePrivileges.isPending) onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Assume privileges of this {noun}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Alert variant="warning" appearance="borderless">
              <AlertDescription>
                This will set your privileges to those of the {noun} for the next hour.
              </AlertDescription>
            </Alert>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogConfirmationField
          inputProps={{ placeholder: `Type ${CONFIRM_KEY} here` }}
          onConfirm={handleConfirm}
        />
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={assumePrivileges.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="project"
            isPending={assumePrivileges.isPending}
            isDisabled={isActionDisabled}
            onClick={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
          >
            Assume Privileges
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
