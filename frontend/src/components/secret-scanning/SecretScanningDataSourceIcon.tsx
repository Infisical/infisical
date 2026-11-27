import { ProviderIcon } from "@app/components/v3";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

type Props = {
  type: SecretScanningDataSource;
  dataSourceName?: string;
  className?: string;
};

export const SecretScanningDataSourceIcon = ({ type, dataSourceName, className }: Props) => {
  const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];

  return (
    <ProviderIcon
      alt={dataSourceName ? `${name} data source ${dataSourceName}` : `${name} data source`}
      title={dataSourceName}
      icon={image}
      className={className}
    />
  );
};
