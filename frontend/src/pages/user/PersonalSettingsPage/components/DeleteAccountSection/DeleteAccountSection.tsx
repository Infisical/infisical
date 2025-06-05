import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useDeleteMe } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

export const DeleteAccountSection = () => {
  const navigate = useNavigate();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteAccount"
  ] as const);

  const { mutateAsync: deleteUserMutateAsync, isPending } = useDeleteMe();

  const handleDeleteAccountSubmit = async () => {
    try {
      await deleteUserMutateAsync();

      createNotification({
        text: "Successfully deleted account",
        type: "success"
      });

      navigate({ to: "/login" });
      handlePopUpClose("deleteAccount");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete account",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-4 text-xl font-semibold text-mineshaft-100">Danger Zone</p>
      <Button
        isLoading={isPending}
        colorSchema="danger"
        variant="outline_bg"
        type="submit"
        onClick={() => handlePopUpOpen("deleteAccount")}
      >
        Delete my account
      </Button>
      <DeleteActionModal
        isOpen={popUp.deleteAccount.isOpen}
        title="Are you sure you want to delete your account?"
        subTitle="Permanently remove this account and all of its data. This action is not reversible, so please be careful."
        onChange={(isOpen) => handlePopUpToggle("deleteAccount", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteAccountSubmit}
      />
    </div>
  );
};
