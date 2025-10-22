import { useMemo } from "react";

import {
  RelayDeploymentInfoMap,
  RelayDeploymentMethod
} from "@app/pages/organization/NetworkingPage/components/RelayTab/components/RelayDeployModal";

type Props = {
  onSelect: (method: RelayDeploymentMethod) => void;
};

export const RelayDeploymentMethodSelect = ({ onSelect }: Props) => {
  const deploymentOptions = useMemo(
    () =>
      (Object.keys(RelayDeploymentInfoMap) as RelayDeploymentMethod[]).map((method) => ({
        method,
        name: RelayDeploymentInfoMap[method].name,
        image: RelayDeploymentInfoMap[method].image
      })),
    []
  );

  const handleResourceSelect = (method: RelayDeploymentMethod) => {
    onSelect(method);
  };

  return (
    <div className="grid h-118 grid-cols-4 content-start gap-2">
      {deploymentOptions.map((option) => {
        const { image, name } = option;

        return (
          <button
            type="button"
            onClick={() => handleResourceSelect(option.method)}
            className="group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
          >
            <div className="relative">
              <img
                src={`/images/integrations/${image}`}
                style={{
                  width: "50px"
                }}
                className="mt-auto"
                alt={`${name} logo`}
              />
            </div>
            <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
              {name}
            </div>
          </button>
        );
      })}
    </div>
  );
};
