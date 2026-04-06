import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const PamResourcePermissionConditions = ({ position = 0, isDisabled }: Props) => {
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.PamResources}
      position={position}
      selectOptions={[
        {
          value: "metadataKey",
          label: "Metadata Key",
          description: "The key of a metadata pair (use with $elemMatch for nested matching)"
        },
        {
          value: "metadataValue",
          label: "Metadata Value",
          description: "The value of a metadata pair (use with $elemMatch for nested matching)"
        },
        {
          value: "name",
          label: "Resource Name",
          description: "PAM resource name"
        },
        {
          value: "resourceType",
          label: "Resource Type",
          description: "PAM resource type (e.g. postgres, mysql, ssh)"
        }
      ]}
    />
  );
};
