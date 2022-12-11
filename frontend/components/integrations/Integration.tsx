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

interface ProjectIntegration {
    app?: string;
    environment: string;
    integration: string;
    integrationAuth: string;
    isActive: Boolean;
}

const Integration = ({ 
    projectIntegration 
}: {
    projectIntegration: ProjectIntegration;
}) => {
    const [integrationEnvironment, setIntegrationEnvironment] = useState(
      reverseEnvMapping[projectIntegration.environment]
    );
    const [fileState, setFileState] = useState([]);
    const router = useRouter();
    const [apps, setApps] = useState([]);
    const [integrationApp, setIntegrationApp] = useState(
      projectIntegration.app ? projectIntegration.app : apps[0]
    );
  
    useEffect(async () => {
      const tempHerokuApps = await getIntegrationApps({
        integrationAuthId: projectIntegration.integrationAuth,
      });
      const tempHerokuAppNames = tempHerokuApps.map((app) => app.name);
      setApps(tempHerokuAppNames);
      setIntegrationApp(
        projectIntegration.app ? projectIntegration.app : tempHerokuAppNames[0]
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
                  !projectIntegration.isActive && [
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
                {projectIntegration.integration.charAt(0).toUpperCase() +
                  projectIntegration.integration.slice(1)}
              </div>
            </div>
            <div>
              <div className="text-gray-400 self-start ml-1 mb-1 text-xs font-semibold tracking-wide">
                HEROKU APP
              </div>
              <ListBox
                data={!projectIntegration.isActive && apps}
                selected={integrationApp}
                onChange={setIntegrationApp}
              />
            </div>
          </div>
          <div className="flex flex-row mt-6">
            {projectIntegration.isActive ? (
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
                    integrationId: projectIntegration._id,
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
                    integrationId: projectIntegration._id,
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