import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";
import { SECRET_ACTION_ALLOWED_CONDITIONS, TFormSchema } from "./ProjectRoleModifySection.utils";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const SecretPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  const { watch } = useFormContext<TFormSchema>();
  const permissionRule = watch(`permissions.${ProjectPermissionSub.Secrets}.${position}`);

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
      actionConditionsMap={SECRET_ACTION_ALLOWED_CONDITIONS}
    />
  );
};
