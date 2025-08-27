import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const SecretPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.Secrets}
      position={position}
      selectOptions={[
        { value: "environment", label: "Environment Slug" },
        { value: "secretPath", label: "Secret Path" },
        { value: "secretName", label: "Secret Name" },
        { value: "secretTags", label: "Secret Tags" }
      ]}
    />
  );
};
