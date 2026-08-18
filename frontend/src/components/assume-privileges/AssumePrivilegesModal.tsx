import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogConfirmationLabel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Field,
  Input
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

export const AssumePrivilegesModal = ({ isOpen, onOpenChange, actorType, actorId }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const assumePrivileges = useAssumeProjectPrivileges();
  const [inputData, setInputData] = useState("");

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

  const isUser = actorType === ActorType.USER;
  const noun = isUser ? "user" : "machine identity";
  const isConfirmed = inputData === CONFIRM_KEY;

  const handleConfirm = () => {
    if (!isConfirmed || !actorId || !currentOrg?.id || !currentProject?.id) return;

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
      onOpenChange={(open) => {
        if (assumePrivileges.isPending) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Do you want to assume privileges of this {noun}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will set your privileges to those of the {noun} for the next hour.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirm();
          }}
        >
          <AlertDialogConfirmationField>
            <Field>
              <AlertDialogConfirmationLabel
                htmlFor="assume-privileges-confirmation"
                confirmationValue={CONFIRM_KEY}
              />
              <Input
                id="assume-privileges-confirmation"
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={CONFIRM_KEY}
                autoComplete="off"
                autoFocus
                disabled={assumePrivileges.isPending}
              />
            </Field>
          </AlertDialogConfirmationField>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" isDisabled={assumePrivileges.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="project"
            isPending={assumePrivileges.isPending}
            isDisabled={!isConfirmed}
            onClick={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
