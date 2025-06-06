import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useOrganization, useOrgPermission } from "@app/context";
import { useDeleteOrgById } from "@app/hooks/api";
import { clearSession } from "@app/hooks/api/users/queries";
import { usePopUp } from "@app/hooks/usePopUp";

export const OrgDeleteSection = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const { membership } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteOrg"] as const);

  const { mutateAsync, isPending } = useDeleteOrgById();

  const handleDeleteOrgSubmit = async () => {
    try {
      if (!currentOrg?.id) return;

      await mutateAsync({
        organizationId: currentOrg?.id
      });

      createNotification({
        text: "Successfully deleted organization",
        type: "success"
      });

      clearSession();
      navigate({ to: "/login" });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete organization",
        type: "error"
      });
    }
  };

  return (
    <>
      <hr className="border-mineshaft-600" />
      <div className="py-4">
        <p className="text-md mb-4 text-mineshaft-100">Danger Zone</p>
        <Button
          isLoading={isPending}
          colorSchema="danger"
          variant="outline_bg"
          type="submit"
          onClick={() => handlePopUpOpen("deleteOrg")}
          isDisabled={Boolean(membership && membership.role !== "admin")}
        >
          {`Delete ${currentOrg?.name}`}
        </Button>
      </div>
      <DeleteActionModal
        isOpen={popUp.deleteOrg.isOpen}
        title="Are you sure you want to delete this organization?"
        subTitle={`Permanently remove ${currentOrg?.name} and all of its data. This action is not reversible, so please be careful.`}
        onChange={(isOpen) => handlePopUpToggle("deleteOrg", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteOrgSubmit}
      />
    </>
  );
};
