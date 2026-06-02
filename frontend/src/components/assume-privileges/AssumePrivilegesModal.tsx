import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Do you want to assume privileges of this {noun}?</DialogTitle>
          <DialogDescription>
            This will set your privileges to those of the {noun} for the next hour.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirm();
          }}
        >
          <Field>
            <FieldLabel>
              Type <span className="font-bold">{CONFIRM_KEY}</span> to perform this action
            </FieldLabel>
            <FieldContent>
              <Input
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={`Type ${CONFIRM_KEY} here`}
                autoComplete="off"
              />
            </FieldContent>
          </Field>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="project"
            onClick={handleConfirm}
            isPending={assumePrivileges.isPending}
            isDisabled={!isConfirmed || assumePrivileges.isPending}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
