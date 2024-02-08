import { useState } from "react";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
// import { OrgPermissionCan } from "@app/components/permissions";
import { 
    // Button,
    IconButton,
    Switch
} from "@app/components/v2";
import {
//   OrgPermissionActions,
//   OrgPermissionSubjects,
  useOrganization,
//   useSubscription
} from "@app/context";
import { useToggle } from "@app/hooks";
// import { usePopUp } from "@app/hooks/usePopUp";
import { useGetScimToken } from "@app/hooks/api";

// TODO: add permissioning for enteprise SCIM

export const OrgSCIMSection = () => {
    const { currentOrg } = useOrganization();
    // const { createNotification } = useNotificationContext();
    // const { subscription } = useSubscription();
    // const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    //     "upgradePlan"
    // ] as const);
    
    const { data: scimToken } = useGetScimToken(currentOrg?.id ?? "");

    const [scimEnabled, setScimEnabled] = useState(false); // sync this with backend
    const [isAPIKeyCopied, setIsAPIKeyCopied] = useToggle(false);
    
    // TODO: get SCIM stuf
    
    const handleSCIMToggle = (value: boolean) => {
        // TODO
        try {
            setScimEnabled(value);
        } catch (err) {
            console.error(err);
        }
    }

    const copyTokenToClipboard = () => {
        navigator.clipboard.writeText(scimToken ?? "");
        setIsAPIKeyCopied.on();
    };
    
    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <h2 className="flex-1 text-xl font-semibold text-white mb-8">SCIM Configuration</h2>
            <Switch
                id="enable-scim"
                onCheckedChange={(value) => handleSCIMToggle(value)}
                isChecked={scimEnabled}
                isDisabled={false}
            >
                Enable SCIM Provisioning
            </Switch>
            {scimEnabled && (
                <div>
                    <div className="mt-8 mb-8">
                        <h3 className="text-sm text-mineshaft-400">SCIM URL</h3>
                        <p className="text-md text-gray-400">{`${window.origin}/api/v1/scim`}</p>
                    </div>
                    {/* <h3 className="mb-2 mt-8 text-sm text-mineshaft-400">SCIM URL</h3> */}
                    {/* <div className="mb-8 max-w-xl flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                        <p className="mr-4 break-all">{`${window.origin}/api/v1/scim`}</p>
                        <IconButton
                            ariaLabel="copy icon"
                            colorSchema="secondary"
                            className="group relative"
                            onClick={copyTokenToClipboard}
                        >
                            <FontAwesomeIcon icon={isAPIKeyCopied ? faCheck : faCopy} />
                            <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                                Click to copy
                            </span>
                        </IconButton>
                    </div> */}
                    {scimToken && (
                        <>
                            <h3 className="mb-2 text-sm text-mineshaft-400">SCIM Bearer Token</h3>
                            <div className="max-w-xl flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                                <p className="mr-4 break-all">{scimToken}</p>
                                <IconButton
                                    ariaLabel="copy icon"
                                    colorSchema="secondary"
                                    className="group relative"
                                    onClick={copyTokenToClipboard}
                                >
                                    <FontAwesomeIcon icon={isAPIKeyCopied ? faCheck : faCopy} />
                                    <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                                        Click to copy
                                    </span>
                                </IconButton>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}