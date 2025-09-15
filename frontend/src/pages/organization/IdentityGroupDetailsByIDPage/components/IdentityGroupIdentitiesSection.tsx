import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton, Tooltip } from "@app/components/v2";
import { OrgPermissionIdentityGroupActions, OrgPermissionSubjects } from "@app/context";
import { useRemoveIdentityFromGroup } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddIdentityToGroupModal } from "./AddIdentityToGroupModal";
import { IdentityGroupIdentitiesTable } from "./IdentityGroupIdentitiesTable";

type Props = {
  identityGroupId: string;
  identityGroupSlug: string;
};

export const IdentityGroupIdentitiesSection = ({ identityGroupId, identityGroupSlug }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addIdentityToGroup",
    "removeIdentityFromGroup"
  ] as const);

  const { mutateAsync: removeIdentityFromGroupMutateAsync } = useRemoveIdentityFromGroup();

  const handleRemoveIdentityFromGroup = async (identityName: string, identityId: string) => {
    try {
      await removeIdentityFromGroupMutateAsync({
        identityGroupId,
        identityId,
        slug: identityGroupSlug
      });

      createNotification({
        text: `Successfully removed identity ${identityName} from the group`,
        type: "success"
      });

      handlePopUpToggle("removeIdentityFromGroup", false);
    } catch {
      createNotification({
        text: `Failed to remove identity ${identityName} from the group`,
        type: "error"
      });
    }
  };

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Identities</h3>
        <OrgPermissionCan
          I={OrgPermissionIdentityGroupActions.Edit}
          a={OrgPermissionSubjects.IdentityGroups}
        >
          {(isAllowed) => (
            <Tooltip content="Add Identity to Group">
              <div className="mb-4 flex items-center justify-center">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="add identity"
                  variant="plain"
                  className="group relative"
                  onClick={() => {
                    handlePopUpOpen("addIdentityToGroup", {
                      identityGroupId,
                      slug: identityGroupSlug
                    });
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} />
                </IconButton>
              </div>
            </Tooltip>
          )}
        </OrgPermissionCan>
      </div>
      <div className="py-4">
        <IdentityGroupIdentitiesTable
          identityGroupId={identityGroupId}
          identityGroupSlug={identityGroupSlug}
          handlePopUpOpen={handlePopUpOpen}
        />
      </div>
      <AddIdentityToGroupModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeIdentityFromGroup.isOpen}
        title={`Are you sure you want to remove ${
          (popUp?.removeIdentityFromGroup?.data as { identityName: string })?.identityName || ""
        } from the identity group?`}
        onChange={(isOpen) => handlePopUpToggle("removeIdentityFromGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const identityData = popUp?.removeIdentityFromGroup?.data as {
            identityName: string;
            identityId: string;
          };

          return handleRemoveIdentityFromGroup(identityData.identityName, identityData.identityId);
        }}
      />
    </div>
  );
};
