import React from "react";
import CloudIntegration from "./CloudIntegration";

interface IntegrationOption {
    name: string;
    type: string;
    clientId: string;
    docsLink: string;
}

interface Props {
    projectIntegrations: any;
    integrations: IntegrationOption[];
    setSelectedIntegrationOption: () => void;
    integrationOptionPress: () => void;
    deleteIntegrationAuth: () => void;
    authorizations: any;
}

const CloudIntegrationSection = ({ 
    projectIntegrations,
    integrations,
    setSelectedIntegrationOption,
    integrationOptionPress,
    deleteIntegrationAuth,
    authorizations
}: Props) => {
    return (
        <>
            <div className={`flex flex-col justify-between items-start m-4 ${projectIntegrations.length > 0 ? 'mt-12' : 'mt-6'} text-xl max-w-5xl px-2`}>
            <h1 className="font-semibold text-3xl">Cloud Integrations</h1>
            <p className="text-base text-gray-400">
                Click on an integration to begin syncing secrets to it.
            </p>
            </div>
            <div className="grid gap-4 grid-cols-4 grid-rows-2 mx-6 max-w-5xl">
            {integrations.map((integration) => (
                <CloudIntegration 
                integration={integration}
                setSelectedIntegrationOption={setSelectedIntegrationOption}
                integrationOptionPress={integrationOptionPress}
                deleteIntegrationAuth={deleteIntegrationAuth}
                authorizations={authorizations}
                />
            ))}
            </div>
        </>
    );
}

export default CloudIntegrationSection;