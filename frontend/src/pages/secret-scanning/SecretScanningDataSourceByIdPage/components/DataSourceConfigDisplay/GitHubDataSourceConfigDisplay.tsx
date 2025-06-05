import { GenericFieldLabel } from "@app/components/v2";
import { TGitHubDataSource } from "@app/hooks/api/secretScanningV2/types/github-data-source";

type Props = {
  dataSource: TGitHubDataSource;
};

export const GitHubDataSourceConfigDisplay = ({ dataSource }: Props) => {
  const {
    config: { includeRepos }
  } = dataSource;

  return (
    <GenericFieldLabel label="Scan Repositories">
      {includeRepos.includes("*") ? "All" : includeRepos.join(", ")}
    </GenericFieldLabel>
  );
};
