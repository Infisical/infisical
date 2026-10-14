import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TBitbucketDataSource } from "@app/hooks/api/secretScanningV2/types/bitbucket-data-source";

type Props = {
  dataSource: TBitbucketDataSource;
};

export const BitbucketDataSourceConfigDisplay = ({ dataSource }: Props) => {
  const {
    config: { includeRepos, workspaceSlug }
  } = dataSource;

  return (
    <>
      <Detail>
        <DetailLabel>Workspace Slug</DetailLabel>
        <DetailValue>{workspaceSlug}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Scan Repositories</DetailLabel>
        <DetailValue>{includeRepos.includes("*") ? "All" : includeRepos.join(", ")}</DetailValue>
      </Detail>
    </>
  );
};
