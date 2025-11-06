import { DocumentationLinkBadge } from "@app/components/v3";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  destination: PkiSync;
  isConfigured: boolean;
};

export const PkiSyncModalHeader = ({ destination, isConfigured }: Props) => {
  const destinationDetails = PKI_SYNC_MAP[destination];

  return (
    <div className="flex w-full items-start gap-2">
      <img
        alt={`${destinationDetails.name} logo`}
        src={`/images/integrations/${destinationDetails.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center gap-x-2 text-mineshaft-300">
          {destinationDetails.name} Certificate Sync
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/documentation/platform/pki/certificate-syncs/${destination}`}
          />
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {isConfigured
            ? `Edit ${destinationDetails.name} Certificate Sync`
            : `Sync certificates to ${destinationDetails.name}`}
        </p>
      </div>
    </div>
  );
};
