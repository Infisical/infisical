import { DocumentationLinkBadge } from "@app/components/v3";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  destination: SecretSync;
  isConfigured: boolean;
};

export const SecretSyncModalHeader = ({ destination, isConfigured }: Props) => {
  const destinationDetails = SECRET_SYNC_MAP[destination];

  return (
    <div className="flex w-full items-start gap-2">
      <img
        alt={`${destinationDetails.name} logo`}
        src={`/images/integrations/${destinationDetails.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 object-contain p-2"
      />
      <div>
        <div className="flex items-center gap-x-2 text-mineshaft-300">
          {destinationDetails.name} Sync
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/integrations/secret-syncs/${destination}`}
          />
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {isConfigured
            ? `Edit ${destinationDetails.name} Sync`
            : `Sync secrets to ${destinationDetails.name}`}
        </p>
      </div>
    </div>
  );
};
