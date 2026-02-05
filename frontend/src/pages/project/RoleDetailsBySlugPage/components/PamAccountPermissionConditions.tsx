import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { ConditionsFields } from "./ConditionsFields";
import { TFormSchema } from "./ProjectRoleModifySection.utils";

type Props = {
  position?: number;
  isDisabled?: boolean;
};

export const PamAccountPermissionConditions = ({ position = 0, isDisabled }: Props) => {
  const { watch } = useFormContext<TFormSchema>();

  // Check if any existing condition uses accountPath
  const conditions = watch(
    `permissions.${ProjectPermissionSub.PamAccounts}.${position}.conditions` as const
  ) as Array<{ lhs: string; operator: string; rhs: string }> | undefined;

  const hasAccountPathCondition = useMemo(() => {
    if (!conditions || !Array.isArray(conditions)) return false;
    return conditions.some((condition) => condition?.lhs === "accountPath");
  }, [conditions]);

  // Build select options - only include accountPath if it's already being used
  const selectOptions = useMemo(() => {
    const options: [{ value: string; label: string }, ...{ value: string; label: string }[]] = [
      { value: "resourceName", label: "Resource Name" },
      { value: "accountName", label: "Account Name" }
    ];

    if (hasAccountPathCondition) {
      options.push({ value: "accountPath", label: "Account Path (Legacy)" });
    }

    return options;
  }, [hasAccountPathCondition]);

  return (
    <ConditionsFields
      isDisabled={isDisabled}
      subject={ProjectPermissionSub.PamAccounts}
      position={position}
      selectOptions={selectOptions}
    />
  );
};
