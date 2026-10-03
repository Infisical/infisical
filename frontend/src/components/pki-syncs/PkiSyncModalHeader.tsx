import { DocumentationLinkBadge } from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
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
      <ProviderIcon
        alt={`${destinationDetails.name} logo`}
        icon={destinationDetails.image}
        className="h-12 w-12 rounded-md bg-surface-recessed object-contain p-2"
      />
      <div>
        <div className="flex items-center gap-x-2 text-label">
          {destinationDetails.name} Certificate Sync
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/documentation/platform/pki/applications/certificate-syncs/${destination}`}
          />
        </div>
        <p className="text-sm leading-4 text-muted">
          {isConfigured
            ? `Edit ${destinationDetails.name} Certificate Sync`
            : `Sync certificates to ${destinationDetails.name}`}
        </p>
      </div>
    </div>
  );
};
