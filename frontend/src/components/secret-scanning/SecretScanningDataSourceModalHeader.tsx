import { DocumentationLinkBadge } from "@app/components/v3";
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
      <img
        alt={`${dataSourceDetails.name} logo`}
        src={`/images/integrations/${dataSourceDetails.image}`}
        className="h-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center gap-x-2 text-mineshaft-300">
          {dataSourceDetails.name} Data Source
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/documentation/platform/secret-scanning/${type}`}
          />
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {isConfigured ? "Edit" : "Connect a"} {dataSourceDetails.name} Data Source
        </p>
      </div>
    </div>
  );
};
