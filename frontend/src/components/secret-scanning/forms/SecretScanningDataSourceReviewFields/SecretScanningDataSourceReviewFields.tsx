import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/v2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { BitbucketDataSourceReviewFields } from "./BitbucketDataSourceReviewFields";
import { GitHubDataSourceReviewFields } from "./GitHubDataSourceReviewFields";

const COMPONENT_MAP: Record<SecretScanningDataSource, React.FC> = {
  [SecretScanningDataSource.GitHub]: GitHubDataSourceReviewFields,
  [SecretScanningDataSource.Bitbucket]: BitbucketDataSourceReviewFields
};

export const SecretScanningDataSourceReviewFields = () => {
  const { watch } = useFormContext<TSecretScanningDataSourceForm>();

  const { type, name, description } = watch();

  const Component = COMPONENT_MAP[type];

  return (
    <div className="mb-4 flex flex-col gap-6">
      <Component />
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Details</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Name">{name}</GenericFieldLabel>
          <GenericFieldLabel label="Description">{description}</GenericFieldLabel>
        </div>
      </div>
    </div>
  );
};
