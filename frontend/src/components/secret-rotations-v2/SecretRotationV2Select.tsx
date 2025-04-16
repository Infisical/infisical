import { faWrench } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Spinner, Tooltip } from "@app/components/v2";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { SecretRotation, useSecretRotationV2Options } from "@app/hooks/api/secretRotationsV2";

type Props = {
  onSelect: (type: SecretRotation) => void;
};

export const SecretRotationV2Select = ({ onSelect }: Props) => {
  const { isPending, data: secretRotationOptions } = useSecretRotationV2Options();

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Loading options...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {secretRotationOptions?.map(({ type }) => {
        const { image, name, size } = SECRET_ROTATION_MAP[type];

        return (
          <button
            type="button"
            key={type}
            onClick={() => onSelect(type)}
            className="group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
          >
            <img
              src={`/images/integrations/${image}`}
              width={size}
              className="mt-auto"
              alt={`${name} logo`}
            />
            <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
              {name}
            </div>
          </button>
        );
      })}
      <Tooltip
        side="bottom"
        className="max-w-sm py-4"
        content={
          <>
            <p className="mb-2">Infisical is constantly adding support for more services.</p>
            <p>
              {`If you don't see the third-party
            service you're looking for,`}{" "}
              <a
                target="_blank"
                className="underline hover:text-mineshaft-300"
                href="https://infisical.com/slack"
                rel="noopener noreferrer"
              >
                let us know on Slack
              </a>{" "}
              or{" "}
              <a
                target="_blank"
                className="underline hover:text-mineshaft-300"
                href="https://github.com/Infisical/infisical/discussions"
                rel="noopener noreferrer"
              >
                make a request on GitHub
              </a>
              .
            </p>
          </>
        }
      >
        <div className="group relative flex h-28 flex-col items-center justify-center rounded-md border border-dashed border-mineshaft-600 bg-mineshaft-800 p-4 hover:bg-mineshaft-900/50">
          <FontAwesomeIcon className="mt-auto text-3xl" icon={faWrench} />
          <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
            Coming Soon
          </div>
        </div>
      </Tooltip>
    </div>
  );
};
