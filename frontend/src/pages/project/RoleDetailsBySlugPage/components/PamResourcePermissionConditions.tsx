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
        { value: "name", label: "Resource Name" },
        { value: "metadataKey", label: "Metadata Key" },
        { value: "metadataValue", label: "Metadata Value" }
      ]}
    />
  );
};
