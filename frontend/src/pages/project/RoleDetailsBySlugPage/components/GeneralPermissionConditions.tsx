import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
  type: ProjectPermissionSub.SecretFolders | ProjectPermissionSub.SecretImports;
};

type SelectOption = { value: string; label: string };
type NonEmptySelectOptions = [SelectOption, ...SelectOption[]];

const DEFAULT_CONDITION_OPTIONS: NonEmptySelectOptions = [
  { value: "environment", label: "Environment Slug" },
  { value: "secretPath", label: "Secret Path" }
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
