import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    DeleteActionModal
} from "@app/components/v2";
import { useDeleteAPIKeyV2 } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { APIKeyV2Modal } from "./APIKeyV2Modal";
import { APIKeyV2Table } from "./APIKeyV2Table";

export const APIKeyV2Section = () => {
    const { createNotification } = useNotificationContext();
    const { mutateAsync: deleteMutateAsync } = useDeleteAPIKeyV2();
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
        "apiKeyV2",
        "deleteAPIKeyV2"
    ] as const);
    
    const onDeleteAPIKeyDataSubmit = async (apiKeyDataId: string) => {
        try {
            await deleteMutateAsync({
                apiKeyDataId
            });
            
            createNotification({
                text: "Successfully deleted API Key V2",
                type: "success"
            });
            
            handlePopUpClose("deleteAPIKeyV2");
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to delete API Key V2",
                type: "error"
            });
        }
      }

    return (
        <div className="mb-6 p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
            <div className="flex justify-between mb-8">
                <p className="text-xl font-semibold text-mineshaft-100">
                    API Keys V2 (Beta)
                </p>
                <Button
                    colorSchema="secondary"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => handlePopUpOpen("apiKeyV2")}
                >
                    Add API Key
                </Button>
            </div>
            <APIKeyV2Table 
                handlePopUpOpen={handlePopUpOpen}
            />
            <APIKeyV2Modal
                popUp={popUp}
                handlePopUpToggle={handlePopUpToggle}
            />
            <DeleteActionModal
                isOpen={popUp.deleteAPIKeyV2.isOpen}
                title={`Are you sure want to delete ${
                (popUp?.deleteAPIKeyV2?.data as { name: string })?.name || ""
                }?`}
                onChange={(isOpen) => handlePopUpToggle("deleteAPIKeyV2", isOpen)}
                deleteKey="confirm"
                onDeleteApproved={() => 
                    onDeleteAPIKeyDataSubmit(
                        (popUp?.deleteAPIKeyV2?.data as { apiKeyDataId: string })?.apiKeyDataId
                    )
                }
            />
        </div>
    );
}