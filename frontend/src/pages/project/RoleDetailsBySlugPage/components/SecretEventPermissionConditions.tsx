import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const SecretEventPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.SecretEventSubscriptions}
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
        }
      ]}
    />
  );
};
