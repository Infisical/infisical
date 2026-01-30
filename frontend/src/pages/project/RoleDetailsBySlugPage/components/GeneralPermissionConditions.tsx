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

export const GeneralPermissionConditions = ({ position = 0, isDisabled, type }: Props) => {
  const selectOptions =
    type === ProjectPermissionSub.SecretRotation
      ? [
          { value: "environment", label: "Environment Slug" },
          { value: "secretPath", label: "Secret Path" },
          { value: "connectionId", label: "App Connection Id" }
        ]
      : [
          { value: "environment", label: "Environment Slug" },
          { value: "secretPath", label: "Secret Path" }
        ];

  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={type}
      position={position}
      selectOptions={selectOptions}
    />
  );
};
