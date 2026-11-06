import { useFormContext, useWatch } from "react-hook-form";

import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConnectionField } from "../SecretScanningDataSourceConnectionField";

type TGitHubForm = TSecretScanningDataSourceForm & { type: SecretScanningDataSource.GitHub };

export const GitHubDataSourceConnectionFields = () => {
  const { control } = useFormContext<TGitHubForm>();
  const isUpdate = Boolean(useWatch({ control, name: "id" }));

  return <SecretScanningDataSourceConnectionField isUpdate={isUpdate} />;
};
