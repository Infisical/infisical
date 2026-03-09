import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
  type: ProjectPermissionSub.SecretFolders | ProjectPermissionSub.SecretImports;
};

type SelectOption = { value: string; label: string; description?: string };
type NonEmptySelectOptions = [SelectOption, ...SelectOption[]];

const DEFAULT_CONDITION_OPTIONS: NonEmptySelectOptions = [
  {
    value: "environment",
    label: "Environment Slug",
    description: "The environment slug (e.g., dev, staging, prod)"
  },
  {
    value: "secretPath",
    label: "Secret Path",
    description: "The path within an environment (e.g., /app/config)"
  }
];

export const GeneralPermissionConditions = ({ position = 0, isDisabled, type }: Props) => {
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={type}
      position={position}
      selectOptions={DEFAULT_CONDITION_OPTIONS}
    />
  );
};
