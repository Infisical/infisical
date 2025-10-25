import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { DocumentationLinkBadge } from "@app/components/v3";
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
          className="h-12 w-12 rounded-md bg-bunker-500 object-contain p-2"
        />
        {appDetails.icon && (
          <FontAwesomeIcon
            icon={appDetails.icon}
            className="absolute right-1 bottom-1 text-primary-700"
          />
        )}
      </div>
      <div>
        <div className="flex items-center gap-x-2 text-mineshaft-300">
          {appDetails.name}
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/integrations/app-connections/${app}`}
          />
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {isConnected ? `${appDetails.name} Connection` : `Connect to ${appDetails.name}`}
        </p>
      </div>
      {onBack && (
        <button
          type="button"
          className="mt-1 ml-auto text-xs text-mineshaft-400 underline underline-offset-2 hover:text-mineshaft-300"
          onClick={onBack}
        >
          Select another App
        </button>
      )}
    </div>
  );
};
