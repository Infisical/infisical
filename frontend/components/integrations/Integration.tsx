import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
    faArrowRight,
    faRotate,
    faX,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  envMapping,
  reverseEnvMapping
} from "../../public/data/frequentConstants";
import updateIntegration from "../../pages/api/integrations/updateIntegration"
import deleteIntegration from "../../pages/api/integrations/DeleteIntegration"
import getIntegrationApps from "../../pages/api/integrations/GetIntegrationApps";
import Button from "~/components/basic/buttons/Button";
import ListBox from "~/components/basic/Listbox";

// TODO: optimize laggy dropdown for app options

interface Integration {
    app?: string;
    environment: string;
    integration: string;
    integrationAuth: string;
    isActive: Boolean;
}

const Integration = ({ 
  integration
}: {
  integration: Integration;
}) => {
    const [integrationEnvironment, setIntegrationEnvironment] = useState(
      reverseEnvMapping[integration.environment]
    );
    const [fileState, setFileState] = useState([]);
    const router = useRouter();
    const [apps, setApps] = useState([]);
    const [integrationApp, setIntegrationApp] = useState(null);
    const [integrationTarget, setIntegrationTarget] = useState(null);
  
    useEffect(async () => {
      const tempApps = await getIntegrationApps({
        integrationAuthId: integration.integrationAuth,
      });
      
      const tempAppNames = tempApps.map((app) => app.name);
      setApps(tempAppNames);
      setIntegrationApp(
        integration.app ? integration.app : tempAppNames[0]
      );
      setIntegrationTarget("Development");
    }, []);
    
    if (!integrationApp || apps.length === 0) return <div></div>
    
    return (
      <div className="max-w-5xl p-6 mx-6 mb-8 rounded-md bg-white/5 flex justify-between">
        <div className="flex">
          <div>
            <p className="text-gray-400 text-xs font-semibold mb-2">ENVIRONMENT</p>
            <ListBox data={!integration.isActive ? [
                  "Development",
                  "Staging",
                  "Testing",
                  "Production",
                ] : null}
              selected={integrationEnvironment}
              onChange={setIntegrationEnvironment}
              isFull={true}
            />
          </div>
          <div className="pt-2">
            <FontAwesomeIcon
              icon={faArrowRight}
              className="mx-4 text-gray-400 mt-8"
            /> 
          </div>
          <div className="mr-2">
            <p className="text-gray-400 text-xs font-semibold mb-2">
              INTEGRATION
            </p>
            <div className="py-2.5 bg-white/[.07] rounded-md pl-4 pr-10 text-sm font-semibold text-gray-300">
              {integration.integration.charAt(0).toUpperCase() +
                integration.integration.slice(1)}
            </div>
          </div>
          <div className="mr-2">
            <div className="text-gray-400 text-xs font-semibold mb-2">
              APP
            </div>
            <ListBox
              data={!integration.isActive && apps}
              selected={integrationApp}
              onChange={setIntegrationApp}
            />
          </div>
          {integration.integration === "vercel" && (
            <div>
              <div className="text-gray-400 text-xs font-semibold mb-2">
                  ENVIRONMENT
              </div>
              <ListBox
                data={!integration.isActive && [
                  "Production",
                  "Preview",
                  "Development"
                ]}
                selected={integrationTarget}
                onChange={setIntegrationTarget}
              />
            </div>
          )}
        </div>
        <div className="flex items-end">
            {integration.isActive ? (
              <div className="max-w-5xl flex flex-row items-center bg-white/5 p-2 rounded-md px-4">
                <FontAwesomeIcon
                  icon={faRotate}
                  className="text-lg mr-2.5 text-primary animate-spin"
                />
                <div className="text-gray-300 font-semibold">In Sync</div>
              </div>
            ) : (
              <Button
                text="Start Integration"
                onButtonPressed={async () => {
                  const result = await updateIntegration({
                    integrationId: integration._id,
                    environment: envMapping[integrationEnvironment],
                    app: integrationApp,
                    isActive: true,
                    target: integrationTarget.toLowerCase()
                  });
                  router.reload();
                }}
                color="mineshaft"
                size="md"
              />
            )}
            <div className="opacity-50 hover:opacity-100 duration-200 ml-2">
              <Button
                onButtonPressed={async () => {
                  await deleteIntegration({
                    integrationId: integration._id,
                  });
                  router.reload();
                }}
                color="red"
                size="icon-md"
                icon={faX}
              />
            </div>
        </div>
      </div>
    );
  };

export default Integration;