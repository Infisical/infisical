import { DocumentationLinkBadge } from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type Props = {
  app: AppConnection;
  isConnected: boolean;
};

export const AppConnectionHeader = ({ app, isConnected }: Props) => {
  const appDetails = APP_CONNECTION_MAP[app];
  const AppIcon = appDetails.icon;

  return (
    <div className="flex w-full items-start gap-2">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-container">
        <img
          alt={`${appDetails.name} logo`}
          src={`/images/integrations/${appDetails.image}`}
          className="h-7 w-7 object-contain"
        />
        {AppIcon && <AppIcon className="absolute right-0.5 bottom-0.5 size-3 text-primary-700" />}
      </div>
      <div>
        <div className="flex items-center gap-x-2 text-mineshaft-300">
          {appDetails.name}
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/integrations/app-connections/${app}`}
          />
        </div>
        <p className="text-sm leading-4 font-normal text-mineshaft-400">
          {isConnected ? `${appDetails.name} Connection` : `Connect to ${appDetails.name}`}
        </p>
      </div>
    </div>
  );
};
