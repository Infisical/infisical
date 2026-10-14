import { DocumentationLinkBadge, SheetDescription, SheetTitle } from "@app/components/v3";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

type Props = {
  type: SecretScanningDataSource;
  isConfigured: boolean;
};

export const SecretScanningDataSourceModalHeader = ({ type, isConfigured }: Props) => {
  const dataSourceDetails = SECRET_SCANNING_DATA_SOURCE_MAP[type];

  return (
    <>
      <SheetTitle className="flex items-center gap-2">
        {dataSourceDetails.name} Data Source
        <DocumentationLinkBadge
          href={`https://infisical.com/docs/documentation/platform/secret-scanning/${type}`}
        />
      </SheetTitle>
      <SheetDescription>
        {isConfigured ? "Edit" : "Connect a"} {dataSourceDetails.name} Data Source
      </SheetDescription>
    </>
  );
};
