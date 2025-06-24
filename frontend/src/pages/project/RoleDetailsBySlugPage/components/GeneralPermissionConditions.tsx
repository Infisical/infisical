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
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={type}
      position={position}
      selectOptions={[
        { value: "environment", label: "Environment Slug" },
        { value: "secretPath", label: "Secret Path" }
      ]}
    />
  );
};
