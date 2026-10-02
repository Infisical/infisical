import { DocumentationLinkBadge } from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

type Props = {
  type: SecretScanningDataSource;
  isConfigured: boolean;
};

export const SecretScanningDataSourceModalHeader = ({ type, isConfigured }: Props) => {
  const dataSourceDetails = SECRET_SCANNING_DATA_SOURCE_MAP[type];

  return (
    <div className="flex w-full items-start gap-2">
      <ProviderIcon
        alt={`${dataSourceDetails.name} logo`}
        icon={dataSourceDetails.image}
        className="h-12 rounded-md bg-surface-recessed p-2"
      />
      <div>
        <div className="flex items-center gap-x-2 text-label">
          {dataSourceDetails.name} Data Source
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/documentation/platform/secret-scanning/${type}`}
          />
        </div>
        <p className="text-sm leading-4 text-muted">
          {isConfigured ? "Edit" : "Connect a"} {dataSourceDetails.name} Data Source
        </p>
      </div>
    </div>
  );
};
