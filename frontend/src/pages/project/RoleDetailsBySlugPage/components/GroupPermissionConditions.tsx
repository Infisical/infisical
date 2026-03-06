import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import {
  ProjectPermissionGroupActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";
import {
  ACTION_ALLOWED_CONDITIONS,
  getActionLabelsForSubject,
  TFormSchema
} from "./ProjectRoleModifySection.utils";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const GroupPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  const { control } = useFormContext<TFormSchema>();
  const permissionRule = useWatch({
    control,
    name: `permissions.${ProjectPermissionSub.Groups}.${position}` as const
  });

  const selectedActions = useMemo(() => {
    if (!permissionRule) return [];

    return Object.entries(permissionRule)
      .filter(
        ([key, value]) =>
          value === true &&
          Object.values(ProjectPermissionGroupActions).includes(
            key as ProjectPermissionGroupActions
          )
      )
      .map(([key]) => key);
  }, [permissionRule]);

  const actionLabelsMap = useMemo(() => getActionLabelsForSubject(ProjectPermissionSub.Groups), []);

  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.Groups}
      position={position}
      selectOptions={[
        {
          value: "groupName",
          label: "Group Name",
          description: "The name of the target group"
        },
        {
          value: "assignableRole",
          label: "Assignable Roles",
          description:
            "The roles that the actor is allowed to assign to the target groups. (e.g., admin, developer, viewer)"
        }
      ]}
      selectedActions={selectedActions}
      actionConditionsMap={ACTION_ALLOWED_CONDITIONS[ProjectPermissionSub.Groups]}
      actionLabelsMap={actionLabelsMap}
    />
  );
};
