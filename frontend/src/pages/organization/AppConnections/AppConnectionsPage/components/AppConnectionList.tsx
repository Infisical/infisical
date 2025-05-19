import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Spinner, Tooltip } from "@app/components/v2";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { useAppConnectionOptions } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type Props = {
  onSelect: (app: AppConnection) => void;
};

export const AppConnectionsSelect = ({ onSelect }: Props) => {
  const { isPending, data: appConnectionOptions } = useAppConnectionOptions();

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Loading options...</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {appConnectionOptions?.map((option) => {
          const { image, name, size = 50 } = APP_CONNECTION_MAP[option.app];

          return (
            <button
              type="button"
              key={option.app}
              onClick={() => onSelect(option.app)}
              className="group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
            >
              <img
                src={`/images/integrations/${image}`}
                style={{
                  width: `${size}px`
                }}
                className="mt-auto"
                alt={`${name} logo`}
              />
              <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
                {name}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-1">
        <div className="max-w-xs text-center text-sm font-medium text-mineshaft-400 duration-200">
          Don&#39;t see the connection you&#39;re looking for?
        </div>
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
          <FontAwesomeIcon className="text-mineshaft-400" size="xs" icon={faInfoCircle} />
        </Tooltip>
      </div>
    </>
  );
};
