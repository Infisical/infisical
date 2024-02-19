import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import {
    Switch,
    UpgradePlanModal
} from "@app/components/v2";
import {
    OrgPermissionActions,
    OrgPermissionSubjects,
    useOrganization,
    useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";
import { useLogoutUser, useUpdateOrg } from "@app/hooks/api";

export const OrgGeneralAuthSection = () => {
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const { subscription } = useSubscription();
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
        "upgradePlan"
    ] as const);
    
    const { mutateAsync } = useUpdateOrg();
    
    const logout = useLogoutUser();
    
    const handleEnforceOrgAuthToggle = async (value: boolean) => {
        try {
            if (!currentOrg?.id) return;
            if (!subscription?.samlSSO) {
                handlePopUpOpen("upgradePlan");
                return;
            }
            
            await mutateAsync({ 
                orgId: currentOrg?.id, 
                authEnforced: value 
            });
            
            createNotification({
                text: `Successfully ${value ? "enforced" : "un-enforced"} org-level auth`,
                type: "success"
            });
            
            if (value) {
                await logout.mutateAsync();
                window.open(`/api/v1/sso/redirect/saml2/organizations/${currentOrg.slug}`);
                window.close();
            }
            
        } catch (err) {
            console.error(err);
            createNotification({
                text: `Failed to ${value ? "enforce" : "un-enforce"} org-level auth`,
                type: "error"
            });
        }
    }

    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <h2 className="flex-1 text-xl font-semibold text-white mb-8">Settings</h2>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
                {(isAllowed) => (
                    <Switch
                        id="enforce-org-auth"
                        onCheckedChange={(value) => handleEnforceOrgAuthToggle(value)}
                        isChecked={currentOrg?.authEnforced ?? false}
                        isDisabled={!isAllowed}
                    >
                        Enforce SAML SSO
                    </Switch>
                )}
            </OrgPermissionCan>
            <UpgradePlanModal
                isOpen={popUp.upgradePlan.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
                text="You can enforce SAML SSO if you switch to Infisical's Pro plan."
            />
        </div>
    );
}