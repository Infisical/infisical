import { motion } from "framer-motion";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { NamespacePermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useNamespace } from "@app/context";

import { withNamespacePermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";

import { AddMemberModal } from "./AddMemberModal";
import { MembersTable } from "./MembersTable";

import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { useDeleteNamespaceUserMembership } from "@app/hooks/api/namespaceUserMembership";

// TODO(namespace): adjust all namespace slug -> namespace name
export const MembersTab = withNamespacePermission(
  () => {
    const { namespaceName } = useNamespace();

    const { mutateAsync: removeUserFromNamespace } = useDeleteNamespaceUserMembership();

    const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
      "addMember",
      "removeMember",
      "upgradePlan"
    ] as const);

    const handleRemoveUser = async () => {
      const membershipId = (popUp?.removeMember?.data as { membershipId: string })?.membershipId;

      try {
        await removeUserFromNamespace({
          membershipId,
          namespaceSlug: namespaceName
        });
        createNotification({
          text: "Successfully removed user from namespace",
          type: "success"
        });
      } catch (error) {
        console.error(error);
        createNotification({
          text: "Failed to remove user from the namespace",
          type: "error"
        });
      }
      handlePopUpClose("removeMember");
    };

    return (
      <motion.div
        key="panel-bamespace-members"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xl font-semibold text-mineshaft-100">Users</p>
            <NamespacePermissionCan
              I={NamespacePermissionActions.Create}
              a={NamespacePermissionSubjects.Member}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("addMember")}
                  isDisabled={!isAllowed}
                >
                  Add Member
                </Button>
              )}
            </NamespacePermissionCan>
          </div>
          <MembersTable handlePopUpOpen={handlePopUpOpen} />
          <AddMemberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
          <DeleteActionModal
            isOpen={popUp.removeMember.isOpen}
            deleteKey="remove"
            title="Do you want to remove this user from the project?"
            onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
            onDeleteApproved={handleRemoveUser}
          />
          <UpgradePlanModal
            isOpen={popUp.upgradePlan.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
            text={(popUp.upgradePlan?.data as { description: string })?.description}
          />
        </div>
      </motion.div>
    );
  },
  {
    action: NamespacePermissionActions.Read,
    subject: NamespacePermissionSubjects.Member
  }
);
