import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button , Switch } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { 
    useGetSSOConfig,
    useUpdateSSOConfig
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { SSOModal } from "./SSOModal";

const ssoAuthProviderMap: { [key: string]: string } = {
    "okta-saml": "Okta SAML 2.0"
}

export const OrgSSOSection = (): JSX.Element => {
    const { currentOrg } = useOrganization();
    const { createNotification } = useNotificationContext();
    const { data, isLoading } = useGetSSOConfig(currentOrg?._id ?? "");
    const { mutateAsync } = useUpdateSSOConfig();
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
        "addSSO"
    ] as const);

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
    
    return (
        <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
            <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    Configuration
                </h2>
                {!isLoading && (
                    <Button
                        onClick={() => handlePopUpOpen("addSSO")}
                        colorSchema="secondary"
                        leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    >
                        {data ? "Update SAML SSO" : "Set up SAML SSO"}
                    </Button> 
                )}
            </div>
            {!isLoading && data && (
                <>
                    <div className="mb-4">
                        <Switch
                            id="enable-saml-sso"
                            onCheckedChange={(value) => handleSamlSSOToggle(value)}
                            isChecked={data.isActive}
                        >
                            Enable SAML SSO
                        </Switch>
                    </div>
                    <div className="mb-4">
                        <h3 className="text-mineshaft-400 text-sm">SSO identifier</h3>
                        <p className="text-gray-400 text-md">{data._id}</p>
                    </div>
                    <div className="mb-4">
                        <h3 className="text-mineshaft-400 text-sm">Type</h3>
                        <p className="text-gray-400 text-md">{ssoAuthProviderMap[data.authProvider]}</p>
                    </div>
                    <div className="mb-4">
                        <h3 className="text-mineshaft-400 text-sm">Audience</h3>
                        <p className="text-gray-400 text-md">{data.audience}</p>
                    </div>
                    <div className="mb-4">
                        <h3 className="text-mineshaft-400 text-sm">Entrypoint</h3>
                        <p className="text-gray-400 text-md">{data.entryPoint}</p>
                    </div>
                    <div className="mb-4">
                        <h3 className="text-mineshaft-400 text-sm">Issuer</h3>
                        <p className="text-gray-400 text-md">{data.issuer}</p>
                    </div>
                </>
            )}
            <SSOModal 
                popUp={popUp}
                handlePopUpClose={handlePopUpClose}
                handlePopUpToggle={handlePopUpToggle}
            />
        </div>
    );
};