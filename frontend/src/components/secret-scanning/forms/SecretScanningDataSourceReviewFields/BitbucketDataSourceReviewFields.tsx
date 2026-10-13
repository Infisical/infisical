import { useFormContext } from "react-hook-form";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConfigReviewSection } from "./shared";

export const BitbucketDataSourceReviewFields = () => {
  const { watch } = useFormContext<
    TSecretScanningDataSourceForm & {
      type: SecretScanningDataSource.Bitbucket;
    }
  >();

  const [{ includeRepos, workspaceSlug }, connection] = watch(["config", "connection"]);
  const shouldScanAll = includeRepos[0] === "*";

  return (
    <SecretScanningDataSourceConfigReviewSection>
      {connection && (
        <Detail>
          <DetailLabel>Connection</DetailLabel>
          <DetailValue>{connection.name || "None"}</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Workspace Slug</DetailLabel>
        <DetailValue>{workspaceSlug || "None"}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Scan Repositories</DetailLabel>
        <DetailValue>{shouldScanAll ? "All" : includeRepos.join(", ") || "None"}</DetailValue>
      </Detail>
    </SecretScanningDataSourceConfigReviewSection>
  );
};
