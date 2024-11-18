import { useRouter } from "next/router";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useDeleteMe } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

export const DeleteAccountSection = () => {
  const router = useRouter();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteAccount"
  ] as const);

  const { mutateAsync: deleteUserMutateAsync, isLoading } = useDeleteMe();

  const handleDeleteAccountSubmit = async () => {
    try {
      await deleteUserMutateAsync();

      createNotification({
        text: "Successfully deleted account",
        type: "success"
      });

      router.push("/login");
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
        isLoading={isLoading}
        colorSchema="danger"
        variant="outline_bg"
        type="submit"
        onClick={() => handlePopUpOpen("deleteAccount")}
      >
        Delete my account
      </Button>
      <DeleteActionModal
        isOpen={popUp.deleteAccount.isOpen}
        title="Are you sure want to delete your account?"
        subTitle="Permanently remove this account and all of its data. This action is not reversible, so please be careful."
        onChange={(isOpen) => handlePopUpToggle("deleteAccount", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteAccountSubmit}
      />
    </div>
  );
};
