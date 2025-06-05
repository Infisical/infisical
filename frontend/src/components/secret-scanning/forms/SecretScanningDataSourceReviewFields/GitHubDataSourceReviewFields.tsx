import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/v2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConfigReviewSection } from "./shared";

export const GitHubDataSourceReviewFields = () => {
  const { watch } = useFormContext<
    TSecretScanningDataSourceForm & {
      type: SecretScanningDataSource.GitHub;
    }
  >();

  const [{ includeRepos }, connection] = watch(["config", "connection"]);
  const shouldScanAll = includeRepos[0] === "*";

  return (
    <SecretScanningDataSourceConfigReviewSection>
      {connection && <GenericFieldLabel label="Connection">{connection.name}</GenericFieldLabel>}
      <GenericFieldLabel label="Scan Repositories">
        {shouldScanAll ? "All" : includeRepos.join(", ")}
      </GenericFieldLabel>
    </SecretScanningDataSourceConfigReviewSection>
  );
};
