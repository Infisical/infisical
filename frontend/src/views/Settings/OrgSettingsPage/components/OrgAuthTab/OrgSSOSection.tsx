import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, Switch, UpgradePlanModal } from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { 
    useCreateSSOConfig,
    useGetSSOConfig,
    useUpdateSSOConfig
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SSOModal } from "./SSOModal";

const ssoAuthProviderMap: { [key: string]: string } = {
    "okta-saml": "Okta SAML",
    "azure-saml": "Azure SAML"
}

export const OrgSSOSection = (): JSX.Element => {
    const { currentOrg } = useOrganization();
    const { subscription } = useSubscription();
    const { createNotification } = useNotificationContext();
    const { data, isLoading } = useGetSSOConfig(currentOrg?._id ?? "");
    const { mutateAsync } = useUpdateSSOConfig();
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
        "upgradePlan",
        "addSSO"
    ] as const);
    
    const { mutateAsync: createMutateAsync } = useCreateSSOConfig();
    
    const handleSamlSSOToggle = async (value: boolean) => {
        try {
            if (!currentOrg?._id) return;

            await mutateAsync({
                organizationId: currentOrg?._id,
                isActive: value
            });

            createNotification({
                text: `Successfully ${value ? "enabled" : "disabled"} SAML SSO`,
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: `Failed to ${value ? "enable" : "disable"} SAML SSO`,
                type: "error"
            });
        }
    }
    
    const addSSOBtnClick = async () => {
        try {
            if (subscription?.samlSSO && currentOrg) {
                if (!data) {
                    // case: SAML SSO is not configured
                    // -> initialize empty SAML SSO configuration
                    await createMutateAsync({
                        organizationId: currentOrg._id,
                        authProvider: "okta-saml",
                        isActive: false,
                        entryPoint: "",
                        issuer: "",
                        cert: ""
                    });
                }

                handlePopUpOpen("addSSO");
            } else {
                handlePopUpOpen("upgradePlan");
            }
        } catch (err) {
            console.error(err);
        }
    }
    
    return (
        <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
            <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    SAML SSO Configuration
                </h2>
                {!isLoading && (
                    <Button
                        onClick={addSSOBtnClick}
                        colorSchema="secondary"
                        leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    >
                        {data ? "Update SAML SSO" : "Set up SAML SSO"}
                    </Button> 
                )}
            </div>
            {data && (
                <div className="mb-4">
                    <Switch
                        id="enable-saml-sso"
                        onCheckedChange={(value) => handleSamlSSOToggle(value)}
                        isChecked={data ? data.isActive : false}
                    >
                        Enable SAML SSO
                    </Switch>
                </div>
            )}
            <div className="mb-4">
                <h3 className="text-mineshaft-400 text-sm">SSO identifier</h3>
                <p className="text-gray-400 text-md">{(data && data._id !== "") ? data._id : "-"}</p>
            </div>
            <div className="mb-4">
                <h3 className="text-mineshaft-400 text-sm">Type</h3>
                <p className="text-gray-400 text-md">{(data && data.authProvider !== "") ? ssoAuthProviderMap[data.authProvider] : "-"}</p>
            </div>
            <div className="mb-4">
                <h3 className="text-mineshaft-400 text-sm">Entrypoint</h3>
                <p className="text-gray-400 text-md">{(data && data.entryPoint !== "") ? data.entryPoint : "-"}</p>
            </div>
            <div className="mb-4">
                <h3 className="text-mineshaft-400 text-sm">Issuer</h3>
                <p className="text-gray-400 text-md">{(data && data.issuer !== "") ? data.issuer : "-"}</p>
            </div>
            <SSOModal 
                popUp={popUp}
                handlePopUpClose={handlePopUpClose}
                handlePopUpToggle={handlePopUpToggle}
            />
            <UpgradePlanModal
                isOpen={popUp.upgradePlan.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
                text="You can use SAML SSO if you switch to Infisical's Pro plan."
            />
        </div>
    );
};