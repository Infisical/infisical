import { GenericFieldLabel } from "@app/components/v2";
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
      <GenericFieldLabel label="Workspace Slug">{workspaceSlug}</GenericFieldLabel>
      <GenericFieldLabel label="Scan Repositories">
        {includeRepos.includes("*") ? "All" : includeRepos.join(", ")}
      </GenericFieldLabel>
    </>
  );
};
