import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
  type:
    | ProjectPermissionSub.SecretFolders
    | ProjectPermissionSub.SecretImports
    | ProjectPermissionSub.SecretRotation;
};

type SelectOption = { value: string; label: string };
type NonEmptySelectOptions = [SelectOption, ...SelectOption[]];

const SECRET_ROTATION_CONDITION_OPTIONS: NonEmptySelectOptions = [
  { value: "environment", label: "Environment Slug" },
  { value: "secretPath", label: "Secret Path" },
  { value: "connectionId", label: "App Connection Id" }
];

const DEFAULT_CONDITION_OPTIONS: NonEmptySelectOptions = [
  { value: "environment", label: "Environment Slug" },
  { value: "secretPath", label: "Secret Path" }
];

export const GeneralPermissionConditions = ({ position = 0, isDisabled, type }: Props) => {
  const selectOptions: NonEmptySelectOptions =
    type === ProjectPermissionSub.SecretRotation
      ? SECRET_ROTATION_CONDITION_OPTIONS
      : DEFAULT_CONDITION_OPTIONS;

  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={type}
      position={position}
      selectOptions={selectOptions}
    />
  );
};
