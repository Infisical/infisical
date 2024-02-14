import { useState } from "react";
import { faPlus, faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
// import { OrgPermissionCan } from "@app/components/permissions";
import { 
    Button,
    IconButton,
    Switch,
    UpgradePlanModal
} from "@app/components/v2";
import {
//   OrgPermissionActions,
//   OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";
import { ScimTokenModal } from "./ScimTokenModal";

// TODO: add permissioning for enteprise SCIM

export const OrgScimSection = () => {
    const { currentOrg } = useOrganization();
    // const { createNotification } = useNotificationContext();
    const { subscription } = useSubscription();
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
        "scimToken",
        "deleteScimToken",
        "upgradePlan"
    ] as const);

    const [scimEnabled, setScimEnabled] = useState(false); // sync this with backend
    
    const addScimTokenBtnClick = () => {
        if (subscription?.scim) {
            handlePopUpOpen("scimToken");
        } else {
            handlePopUpOpen("upgradePlan");
        }
    }
    
    const handleSCIMToggle = (value: boolean) => {
        try {
            setScimEnabled(value);
        } catch (err) {
            console.error(err);
        }
    }
    
    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <div className="mb-8 flex items-center">
                <h2 className="flex-1 text-xl font-semibold text-white">SCIM Configuration</h2>
                <Button
                    onClick={addScimTokenBtnClick}
                    colorSchema="secondary"
                    // isDisabled={!isAllowed}
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                >
                    Manage SCIM Tokens
                </Button>
            </div>
            <Switch
                id="enable-scim"
                onCheckedChange={(value) => handleSCIMToggle(value)}
                isChecked={scimEnabled}
                isDisabled={false}
            >
                Enable SCIM Provisioning
            </Switch>
            <ScimTokenModal 
                popUp={popUp}
                handlePopUpOpen={handlePopUpOpen}
                handlePopUpToggle={handlePopUpToggle}
            />
            <UpgradePlanModal
                isOpen={popUp.upgradePlan.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
                text="You can use SCIM Provisioning if you switch to Infisical's Pro plan."
            />
        </div>
    );
}