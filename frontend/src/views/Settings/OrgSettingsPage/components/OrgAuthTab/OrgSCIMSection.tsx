import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { 
    Button,
    Switch,
    UpgradePlanModal
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useSubscription,
  useOrganization
} from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";
import { ScimTokenModal } from "./ScimTokenModal";
import { useUpdateOrg } from "@app/hooks/api";

export const OrgScimSection = () => {
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const { subscription } = useSubscription();
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
        "scimToken",
        "deleteScimToken",
        "upgradePlan"
    ] as const);
    
    const { mutateAsync } = useUpdateOrg();
    
    const addScimTokenBtnClick = () => {
        if (subscription?.scim) {
            handlePopUpOpen("scimToken");
        } else {
            handlePopUpOpen("upgradePlan");
        }
    }
    
    const handleEnableSCIMToggle = async (value: boolean) => {
        try {
            if (!currentOrg?.id) return;
            if (!subscription?.scim) {
                handlePopUpOpen("upgradePlan");
                return;
            }
            
            await mutateAsync({
                orgId: currentOrg?.id,
                scimEnabled: value
            });

            createNotification({
                text: `Successfully ${value ? "enabled" : "disabled"} SCIM provisioning`,
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: `Failed to ${value ? "enable" : "disable"} SCIM provisioning`,
                type: "error"
            });
        }
    }
    
    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <div className="mb-8 flex items-center">
                <h2 className="flex-1 text-xl font-semibold text-white">SCIM Configuration</h2>
                <OrgPermissionCan I={OrgPermissionActions.Read} a={OrgPermissionSubjects.Scim}>
                    {(isAllowed) => (
                        <Button
                            onClick={addScimTokenBtnClick}
                            colorSchema="secondary"
                            isDisabled={!isAllowed}
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}
                        >
                            Manage SCIM Tokens
                        </Button>
                    )}
                </OrgPermissionCan>
            </div>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Scim}>
                <Switch
                    id="enable-scim"
                    onCheckedChange={(value) => {
                        if (subscription?.scim) {
                            handleEnableSCIMToggle(value)
                        } else {
                            handlePopUpOpen("upgradePlan");
                        }
                    }}
                    isChecked={currentOrg?.scimEnabled ?? false}
                    isDisabled={false}
                >
                    Enable SCIM Provisioning
                </Switch>
            </OrgPermissionCan>
            <ScimTokenModal 
                popUp={popUp}
                handlePopUpOpen={handlePopUpOpen}
                handlePopUpToggle={handlePopUpToggle}
            />
            <UpgradePlanModal
                isOpen={popUp.upgradePlan.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
                text="You can use SCIM Provisioning if you switch to Infisical's Enterprise plan."
            />
        </div>
    );
}