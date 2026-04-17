import { useMemo } from "react";
import { Control, UseFormSetValue, useWatch } from "react-hook-form";

import { TFormSchema, TOrgPermissionAction } from "../OrgRoleModifySection.utils";

export const useOrgPermissionActions = ({
  control,
  setValue,
  formPath,
  permissionActions
}: {
  control: Control<TFormSchema>;
  setValue: UseFormSetValue<TFormSchema>;
  formPath: string;
  permissionActions: readonly TOrgPermissionAction[];
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rule = useWatch({ control, name: formPath as any });

  const selectedActions = useMemo(
    () => permissionActions.filter((opt) => Boolean(rule?.[opt.value])),
    [rule, permissionActions]
  );

  const handleActionsChange = (newValue: unknown) => {
    const selected = Array.isArray(newValue) ? newValue : [];
    const updated = Object.fromEntries(
      permissionActions.map(({ value }) => [
        value,
        selected.some((s: { value: string }) => s.value === value)
      ])
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setValue(formPath as any, updated as any, { shouldDirty: true });
  };

  return { rule, selectedActions, handleActionsChange };
};
