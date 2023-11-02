import { useRouter } from "next/router";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useOrganization, useOrgPermission } from "@app/context";
import { useDeleteOrgById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { navigateUserToOrg } from "@app/views/Login/Login.utils";

export const OrgDeleteSection = () => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { createNotification } = useNotificationContext();
  const { membership } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteOrg"
  ] as const);

  const { mutateAsync, isLoading } = useDeleteOrgById();

  const handleDeleteOrgSubmit = async () => {
    try {
      if (!currentOrg?._id) return;

      await mutateAsync({
        organizationId: currentOrg?._id
      });

      createNotification({
        text: "Successfully deleted organization",
        type: "success"
      });

      await navigateUserToOrg(router);

      handlePopUpClose("deleteOrg");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete organization",
        type: "error"
      });
    }
  };

  return (
    <div className="p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600 mb-6">
      <p className="text-xl font-semibold text-mineshaft-100 mb-4">Danger Zone</p>
      <Button
        isLoading={isLoading}
        colorSchema="danger"
        variant="outline_bg"
        type="submit"
        onClick={() => handlePopUpOpen("deleteOrg")}
        isDisabled={Boolean(membership && membership.role !== "admin")}
      >
        {`Delete ${currentOrg?.name}`}
      </Button>
      <DeleteActionModal
        isOpen={popUp.deleteOrg.isOpen}
        title="Are you sure want to delete this organization?"
        subTitle={`Permanently remove ${currentOrg?.name} and all of its data. This action is not reversible, so please be careful.`}
        onChange={(isOpen) => handlePopUpToggle("deleteOrg", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteOrgSubmit}
      />
    </div>
  );
};
