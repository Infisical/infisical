import { useRouter } from "next/router";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    DeleteActionModal
} from "@app/components/v2";
import { useDeleteUser } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

export const DeleteAccountSection = () => {
    const router = useRouter();
    const { createNotification } = useNotificationContext();
    const { popUp, handlePopUpOpen, handlePopUpClose,  handlePopUpToggle } = usePopUp([
        "deleteAccount"
    ] as const);

    const { mutateAsync: deleteUserMutateAsync, isLoading } = useDeleteUser();

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
    }
    
    return (
        <div className="p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600 mb-6">
            <p className="text-xl font-semibold text-mineshaft-100 mb-4">
                Danger Zone
            </p>
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
}