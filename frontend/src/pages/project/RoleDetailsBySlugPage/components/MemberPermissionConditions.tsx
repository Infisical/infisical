import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import {
  ProjectPermissionMemberActions,
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

export const MemberPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  const { control } = useFormContext<TFormSchema>();
  const permissionRule = useWatch({
    control,
    name: `permissions.${ProjectPermissionSub.Member}.${position}` as const
  });

  const selectedActions = useMemo(() => {
    if (!permissionRule) return [];

    return Object.entries(permissionRule)
      .filter(
        ([key, value]) =>
          value === true &&
          Object.values(ProjectPermissionMemberActions).includes(
            key as ProjectPermissionMemberActions
          )
      )
      .map(([key]) => key);
  }, [permissionRule]);

  const actionLabelsMap = useMemo(() => getActionLabelsForSubject(ProjectPermissionSub.Member), []);

  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.Member}
      position={position}
      selectOptions={[
        {
          value: "email",
          label: "User Email",
          description: "The email address of the target user whose roles are being updated"
        },
        {
          value: "role",
          label: "Assignable Roles",
          description:
            "The roles that the actor is allowed to assign to the target users. (e.g., admin, developer, viewer)"
        },
        {
          value: "subject",
          label: "Assignable Subjects",
          description:
            "The permission subjects that the actor is allowed to grant in additional privileges to the target users. (e.g., secrets, environments, members)"
        },
        {
          value: "action",
          label: "Assignable Actions",
          description:
            "The specific actions that the actor is allowed to grant in additional privileges to the target users. (e.g., secrets:read, environments:edit)"
        }
      ]}
      selectedActions={selectedActions}
      actionConditionsMap={ACTION_ALLOWED_CONDITIONS[ProjectPermissionSub.Member]}
      actionLabelsMap={actionLabelsMap}
    />
  );
};
