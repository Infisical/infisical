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
        { value: "resourceName", label: "Resource Name" },
        { value: "accountName", label: "Account Name" }
      ]}
    />
  );
};
