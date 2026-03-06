import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import {
  ProjectPermissionIdentityActions,
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

export const IdentityManagementPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  const { control } = useFormContext<TFormSchema>();
  const permissionRule = useWatch({
    control,
    name: `permissions.${ProjectPermissionSub.Identity}.${position}` as const
  });

  const selectedActions = useMemo(() => {
    if (!permissionRule) return [];

    return Object.entries(permissionRule)
      .filter(
        ([key, value]) =>
          value === true &&
          Object.values(ProjectPermissionIdentityActions).includes(
            key as ProjectPermissionIdentityActions
          )
      )
      .map(([key]) => key);
  }, [permissionRule]);

  const actionLabelsMap = useMemo(
    () => getActionLabelsForSubject(ProjectPermissionSub.Identity),
    []
  );

  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.Identity}
      position={position}
      selectOptions={[
        {
          value: "identityId",
          label: "Identity ID",
          description: "The unique identifier of the target machine identity"
        },
        {
          value: "assignableRole",
          label: "Assignable Roles",
          description:
            "The roles that the actor is allowed to assign to the target machine identities. (e.g., admin, developer, viewer)"
        },
        {
          value: "assignableSubject",
          label: "Assignable Subjects",
          description:
            "The permission subjects that the actor is allowed to grant in additional privileges to the target machine identities. (e.g., secrets, environments, members)"
        },
        {
          value: "assignableAction",
          label: "Assignable Actions",
          description:
            "The specific actions that the actor is allowed to grant in additional privileges to the target machine identities. (e.g., secrets:read, environments:edit)"
        }
      ]}
      selectedActions={selectedActions}
      actionConditionsMap={ACTION_ALLOWED_CONDITIONS[ProjectPermissionSub.Identity]}
      actionLabelsMap={actionLabelsMap}
    />
  );
};
