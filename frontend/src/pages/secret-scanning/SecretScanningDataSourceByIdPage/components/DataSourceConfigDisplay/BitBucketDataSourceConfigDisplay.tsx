import { GenericFieldLabel } from "@app/components/v2";
import { TBitBucketDataSource } from "@app/hooks/api/secretScanningV2/types/bitbucket-data-source";

type Props = {
  dataSource: TBitBucketDataSource;
};

export const BitBucketDataSourceConfigDisplay = ({ dataSource }: Props) => {
  const {
    config: { includeRepos }
  } = dataSource;

  return (
    <GenericFieldLabel label="Scan Repositories">
      {includeRepos.includes("*") ? "All" : includeRepos.join(", ")}
    </GenericFieldLabel>
  );
};
