import { useFormContext } from "react-hook-form";

import {
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { BitbucketDataSourceReviewFields } from "./BitbucketDataSourceReviewFields";
import { GitHubDataSourceReviewFields } from "./GitHubDataSourceReviewFields";
import { GitLabDataSourceReviewFields } from "./GitLabDataSourceReviewFields";

const COMPONENT_MAP: Record<SecretScanningDataSource, React.FC> = {
  [SecretScanningDataSource.GitHub]: GitHubDataSourceReviewFields,
  [SecretScanningDataSource.Bitbucket]: BitbucketDataSourceReviewFields,
  [SecretScanningDataSource.GitLab]: GitLabDataSourceReviewFields
};

export const SecretScanningDataSourceReviewFields = () => {
  const { watch } = useFormContext<TSecretScanningDataSourceForm>();

  const { type, name, description } = watch();

  const Component = COMPONENT_MAP[type];

  return (
    <div className="mb-4 flex flex-col gap-6">
      <Component />
      <DetailGroup>
        <DetailGroupHeader>Details</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{name || "None"}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Description</DetailLabel>
            <DetailValue>{description || "None"}</DetailValue>
          </Detail>
        </div>
      </DetailGroup>
    </div>
  );
};
