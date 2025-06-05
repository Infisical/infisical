import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type Props = {
  app: AppConnection;
  isConnected: boolean;
  onBack?: () => void;
};

export const AppConnectionHeader = ({ app, isConnected, onBack }: Props) => {
  const appDetails = APP_CONNECTION_MAP[app];

  return (
    <div className="mb-4 flex w-full items-start gap-2 border-b border-mineshaft-500 pb-4">
      <div className="relative">
        <img
          alt={`${appDetails.name} logo`}
          src={`/images/integrations/${appDetails.image}`}
          className="h-12 w-12 rounded-md bg-bunker-500 p-2"
        />
        {appDetails.icon && (
          <FontAwesomeIcon
            icon={appDetails.icon}
            className="absolute bottom-1 right-1 text-primary-700"
          />
        )}
      </div>
      <div>
        <div className="flex items-center text-mineshaft-300">
          {appDetails.name}
          <a
            href={`https://infisical.com/docs/integrations/app-connections/${app}`}
            target="_blank"
            className="mb-1 ml-1"
            rel="noopener noreferrer"
          >
            <div className="inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
              <FontAwesomeIcon icon={faBookOpen} className="mb-[0.03rem] mr-1 text-[12px]" />
              <span>Docs</span>
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.07rem] ml-1 text-[10px]"
              />
            </div>
          </a>
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {isConnected ? `${appDetails.name} Connection` : `Connect to ${appDetails.name}`}
        </p>
      </div>
      {onBack && (
        <button
          type="button"
          className="ml-auto mt-1 text-xs text-mineshaft-400 underline underline-offset-2 hover:text-mineshaft-300"
          onClick={onBack}
        >
          Select another App
        </button>
      )}
    </div>
  );
};
