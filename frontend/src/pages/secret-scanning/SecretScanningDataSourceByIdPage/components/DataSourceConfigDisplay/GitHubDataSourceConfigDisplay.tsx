import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TGitHubDataSource } from "@app/hooks/api/secretScanningV2/types/github-data-source";

type Props = {
  dataSource: TGitHubDataSource;
};

export const GitHubDataSourceConfigDisplay = ({ dataSource }: Props) => {
  const {
    config: { includeRepos }
  } = dataSource;

  return (
    <Detail>
      <DetailLabel>Scan Repositories</DetailLabel>
      <DetailValue>{includeRepos.includes("*") ? "All" : includeRepos.join(", ")}</DetailValue>
    </Detail>
  );
};
