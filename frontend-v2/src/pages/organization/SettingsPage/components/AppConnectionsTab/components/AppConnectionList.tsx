import { faWrench } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Spinner, Tooltip } from "@app/components/v2";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { useAppConnectionOptions } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type Props = {
  onSelect: (app: AppConnection) => void;
};

export const AppConnectionsSelect = ({ onSelect }: Props) => {
  const { isLoading, data: appConnectionOptions } = useAppConnectionOptions();

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Loading options...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-2">
      {appConnectionOptions?.map((option) => (
        <button
          type="button"
          key={option.app}
          onClick={() => onSelect(option.app)}
          className="group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
        >
          <img
            src={`/images/integrations/${APP_CONNECTION_MAP[option.app].image}`}
            height={50}
            width={50}
            className="mt-auto"
            alt={`${APP_CONNECTION_MAP[option.app].name} logo`}
          />
          <div className="mt-auto max-w-xs text-center text-sm font-medium text-gray-300 duration-200 group-hover:text-gray-200">
            {APP_CONNECTION_MAP[option.app].name}
          </div>
        </button>
      ))}
      <Tooltip
        side="bottom"
        className="max-w-sm py-4"
        content={
          <>
            <p className="mb-2">Infisical is constantly adding support for more connections.</p>
            <p>
              {`If you don't see the third-party
            app you're looking for,`}{" "}
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
        <div className="group relative flex h-28 flex-col items-center justify-center rounded-md border border-dashed border-mineshaft-600 bg-mineshaft-800 p-4">
          <FontAwesomeIcon className="mt-auto text-xl" icon={faWrench} />
          <div className="mt-auto max-w-xs text-center text-sm font-medium text-gray-300 duration-200 group-hover:text-gray-200">
            Coming Soon
          </div>
        </div>
      </Tooltip>
    </div>
  );
};
