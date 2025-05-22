import { GenericFieldLabel } from "@app/components/v2";
import { TGitLabDataSource } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

type Props = {
  dataSource: TGitLabDataSource;
};

export const GitLabConfigDisplay = ({ dataSource }: Props) => {
  const {
    config: { includeProjects }
  } = dataSource;

  return (
    <GenericFieldLabel label="Scan Projects">
      {includeProjects.includes("*") ? "All" : includeProjects.join(", ")}
    </GenericFieldLabel>
  );
};
