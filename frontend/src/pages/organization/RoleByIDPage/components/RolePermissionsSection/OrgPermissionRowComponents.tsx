import { useMemo } from "react";
import { Control, UseFormSetValue, useWatch } from "react-hook-form";
import { components, MultiValueProps, MultiValueRemoveProps, OptionProps } from "react-select";
import { CheckIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

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

export type OrgPermissionActionOption = {
  label: string;
  value: string;
  description?: string;
};

export const OptionWithDescription = <T extends OrgPermissionActionOption>(
  props: OptionProps<T>
) => {
  const { data, children, isSelected } = props;
  return (
    <components.Option {...props}>
      <div className="flex flex-row items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate">{children}</p>
          {data.description && (
            <p className="truncate text-xs leading-4 text-muted">{data.description}</p>
          )}
        </div>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};

export const MultiValueRemove = ({ selectProps, ...props }: MultiValueRemoveProps) => {
  if (selectProps?.isDisabled) {
    return null;
  }
  return <components.MultiValueRemove selectProps={selectProps} {...props} />;
};

export const MultiValueWithTooltip = <T extends OrgPermissionActionOption>(
  props: MultiValueProps<T>
) => {
  const { data } = props;
  if (!data.description) {
    return <components.MultiValue {...props} />;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <components.MultiValue {...props} />
        </div>
      </TooltipTrigger>
      <TooltipContent>{data.description}</TooltipContent>
    </Tooltip>
  );
};
