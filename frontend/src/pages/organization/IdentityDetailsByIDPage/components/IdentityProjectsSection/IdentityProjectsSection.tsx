import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import {
  useDeleteProjectIdentityMembership,
  useGetIdentityProjectMemberships
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityAddToProjectModal } from "./IdentityAddToProjectModal";
import { IdentityProjectsTable } from "./IdentityProjectsTable";

type Props = {
  identityId: string;
};

export const IdentityProjectsSection = ({ identityId }: Props) => {
  const { mutateAsync: deleteMutateAsync } = useDeleteProjectIdentityMembership();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addIdentityToProject",
    "removeIdentityFromProject"
  ] as const);

  const onRemoveIdentitySubmit = async (id: string, projectId: string) => {
    await deleteMutateAsync({
      identityId: id,
      projectId
    });

    createNotification({
      text: "Successfully removed identity from project",
      type: "success"
    });

    handlePopUpClose("removeIdentityFromProject");
  };

  const { data: projectMemberships } = useGetIdentityProjectMemberships(identityId);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Projects</UnstableCardTitle>
          <UnstableCardDescription>
            Manage machine identity project memberships
          </UnstableCardDescription>
          {Boolean(projectMemberships?.length) && (
            <UnstableCardAction>
              <Button
                onClick={() => {
                  handlePopUpOpen("addIdentityToProject");
                }}
                size="xs"
                variant="outline"
              >
                <PlusIcon />
                Add to Project
              </Button>
            </UnstableCardAction>
          )}
        </UnstableCardHeader>
        <UnstableCardContent>
          <IdentityProjectsTable identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
        </UnstableCardContent>
      </UnstableCard>
      <DeleteActionModal
        isOpen={popUp.removeIdentityFromProject.isOpen}
        title={`Are you sure you want to remove ${
          (popUp?.removeIdentityFromProject?.data as { identityName: string })?.identityName || ""
        } from ${
          (popUp?.removeIdentityFromProject?.data as { projectName: string })?.projectName || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeIdentityFromProject", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const popupData = popUp?.removeIdentityFromProject?.data as {
            identityId: string;
            projectId: string;
          };

          return onRemoveIdentitySubmit(popupData.identityId, popupData.projectId);
        }}
      />
      <IdentityAddToProjectModal
        identityId={identityId}
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
      />
    </>
  );
};
