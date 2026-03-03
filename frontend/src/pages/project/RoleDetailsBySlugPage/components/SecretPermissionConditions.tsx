import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";
import { ACTION_ALLOWED_CONDITIONS, TFormSchema } from "./ProjectRoleModifySection.utils";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

const SECRET_ACTION_LABELS: Record<string, string> = {
  [ProjectPermissionSecretActions.DescribeAndReadValue]: "Read",
  [ProjectPermissionSecretActions.DescribeSecret]: "Describe Secret",
  [ProjectPermissionSecretActions.ReadValue]: "Read Value",
  [ProjectPermissionSecretActions.Create]: "Create",
  [ProjectPermissionSecretActions.Edit]: "Modify",
  [ProjectPermissionSecretActions.Delete]: "Remove",
  [ProjectPermissionSecretActions.ImportSecret]: "Import Secret (Test)",
  [ProjectPermissionSecretActions.DuplicateSecret]: "Duplicate Secret (Test)"
};

export const SecretPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  const { control } = useFormContext<TFormSchema>();
  const permissionRule = useWatch({
    control,
    name: `permissions.${ProjectPermissionSub.Secrets}.${position}` as const
  });

  const selectedActions = useMemo(() => {
    if (!permissionRule) return [];

    return Object.entries(permissionRule)
      .filter(
        ([key, value]) =>
          value === true &&
          Object.values(ProjectPermissionSecretActions).includes(
            key as ProjectPermissionSecretActions
          )
      )
      .map(([key]) => key);
  }, [permissionRule]);

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
      selectedActions={selectedActions}
      actionConditionsMap={ACTION_ALLOWED_CONDITIONS[ProjectPermissionSub.Secrets]}
      actionLabelsMap={SECRET_ACTION_LABELS}
    />
  );
};
