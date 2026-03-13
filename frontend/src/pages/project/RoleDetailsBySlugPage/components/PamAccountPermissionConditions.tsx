import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const PamAccountPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.PamAccounts}
      position={position}
      selectOptions={[
        {
          value: "resourceName",
          label: "Resource Name",
          description: "PAM resource name"
        },
        {
          value: "accountName",
          label: "Account Name",
          description: "PAM account name"
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
