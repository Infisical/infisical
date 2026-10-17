import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TBitbucketDataSource } from "@app/hooks/api/secretScanningV2/types/bitbucket-data-source";

type Props = {
  dataSource: TBitbucketDataSource;
};

export const BitbucketDataSourceConfigDisplay = ({ dataSource }: Props) => (
  <Detail>
    <DetailLabel>Workspace Slug</DetailLabel>
    <DetailValue>{dataSource.config.workspaceSlug}</DetailValue>
  </Detail>
);
