import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const DynamicSecretPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.DynamicSecrets}
      position={position}
      selectOptions={[
        {
          value: "environment",
          label: "Environment Slug",
          description: "The environment slug (e.g., dev, staging, prod)"
        },
        {
          value: "secretPath",
          label: "Secret Path",
          description: "The path within an environment (e.g., /app/config)"
        },
        {
          value: "metadataKey",
          label: "Metadata Key",
          description: "The key of a metadata pair (use with $elemMatch for nested matching)"
        },
        {
          value: "metadataValue",
          label: "Metadata Value",
          description: "The value of a metadata pair (use with $elemMatch for nested matching)"
        }
      ]}
    />
  );
};
