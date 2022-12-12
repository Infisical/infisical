import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
    faArrowRight,
    faRotate,
    faX,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    reverseEnvMapping
} from "../../public/data/frequentConstants";
import updateIntegration from "../../pages/api/integrations/updateIntegration"
import deleteIntegration from "../../pages/api/integrations/DeleteIntegration"
import getIntegrationApps from "../../pages/api/integrations/GetIntegrationApps";
import Button from "~/components/basic/buttons/Button";
import ListBox from "~/components/basic/Listbox";

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
    const [integrationApp, setIntegrationApp] = useState(
      integration.app ? integration.app : apps[0]
    );
  
    useEffect(async () => {
      const tempHerokuApps = await getIntegrationApps({
        integrationAuthId: integration.integrationAuth,
      });
      
      const tempHerokuAppNames = tempHerokuApps.map((app) => app.name);
      setApps(tempHerokuAppNames);
      setIntegrationApp(
        integration.app ? integration.app : tempHerokuAppNames[0]
      );
    }, []);
  
    return (
      <div className="flex flex-col max-w-5xl justify-center bg-white/5 p-6 rounded-md mx-6 mt-8">
        <div className="relative px-4 flex flex-row items-center justify-between mb-4">
          <div className="flex flex-row">
            <div>
              <div className="text-gray-400 self-start ml-1 mb-1 text-xs font-semibold tracking-wide">
                ENVIRONMENT
              </div>
              <ListBox
                data={
                  !integration.isActive && [
                    "Development",
                    "Staging",
                    "Production",
                  ]
                }
                selected={integrationEnvironment}
                onChange={setIntegrationEnvironment}
              />
            </div>
            <FontAwesomeIcon
              icon={faArrowRight}
              className="mx-4 text-gray-400 mt-8"
            />
            <div className="mr-2">
              <div className="text-gray-400 self-start ml-1 mb-1 text-xs font-semibold tracking-wide">
                INTEGRATION
              </div>
              <div className="py-2.5 bg-white/[.07] rounded-md pl-4 pr-20 text-sm font-semibold text-gray-300">
                {integration.integration.charAt(0).toUpperCase() +
                  integration.integration.slice(1)}
              </div>
            </div>
            <div>
              <div className="text-gray-400 self-start ml-1 mb-1 text-xs font-semibold tracking-wide">
                HEROKU APP
              </div>
              <ListBox
                data={!integration.isActive && apps}
                selected={integrationApp}
                onChange={setIntegrationApp}
              />
            </div>
          </div>
          <div className="flex flex-row mt-6">
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
                    isActive: true
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
      </div>
    );
  };

export default Integration;