import { cloneElement, Fragment, RefObject, useMemo } from "react";
import { Control, Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { components, MultiValueProps, MultiValueRemoveProps, OptionProps } from "react-select";
import { CheckIcon, NetworkIcon, PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";

import {
  isConditionalSubjects,
  TFormSchema,
  TProjectPermissionObject
} from "./ProjectRoleModifySection.utils";

type Props<T extends ProjectPermissionSub> = {
  title: string;
  description: string;
  subject: T;
  actions: TProjectPermissionObject[T]["actions"];
  children?: JSX.Element;
  isDisabled?: boolean;
  isOpen?: boolean;
  onShowAccessTree?: (subject: ProjectPermissionSub) => void;
  menuPortalContainerRef?: RefObject<HTMLElement | null>;
};

type ActionOption = {
  label: string;
  value: string;
  description?: string;
};

const OptionWithDescription = <T extends ActionOption>(props: OptionProps<T>) => {
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

const MultiValueRemove = ({ selectProps, ...props }: MultiValueRemoveProps) => {
  if (selectProps?.isDisabled) {
    return null;
  }
  return <components.MultiValueRemove selectProps={selectProps} {...props} />;
};

const MultiValueWithTooltip = <T extends ActionOption>(props: MultiValueProps<T>) => {
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

type ActionsMultiSelectProps<T extends ProjectPermissionSub> = {
  subject: T;
  rootIndex: number;
  actions: TProjectPermissionObject[T]["actions"];
  isDisabled?: boolean;
  control: Control<TFormSchema>;
  menuPortalContainerRef?: RefObject<HTMLElement | null>;
};

const ActionsMultiSelect = <T extends ProjectPermissionSub>({
  subject,
  rootIndex,
  actions,
  isDisabled,
  control,
  menuPortalContainerRef
}: ActionsMultiSelectProps<T>) => {
  const { setValue } = useFormContext<TFormSchema>();

  const permissionRule = useWatch({
    control,
    name: `permissions.${subject}.${rootIndex}` as any,
    defaultValue: {}
  });

  const visibleActions = useMemo(
    () =>
      actions.filter(({ value }) => {
        if (typeof value !== "string") return false;

        if (subject === ProjectPermissionSub.Secrets && value === "read") {
          return Boolean(permissionRule?.read);
        }

        return true;
      }),
    [actions, subject, permissionRule?.read]
  );

  const actionOptions = useMemo(
    () =>
      visibleActions.map(({ label, value, description }) => ({
        label: typeof label === "string" ? label : "",
        value: value as string,
        description
      })),
    [visibleActions]
  );

  const selectedActions = useMemo(
    () => actionOptions.filter((opt) => Boolean(permissionRule?.[opt.value])),
    [actionOptions, permissionRule]
  );

  const handleChange = (newValue: unknown) => {
    const selectedArray = Array.isArray(newValue) ? newValue : [];
    visibleActions.forEach(({ value }) => {
      const valueStr = String(value);
      const isSelected = selectedArray.some((s: { value: string }) => s.value === valueStr);
      setValue(`permissions.${subject}.${rootIndex}.${valueStr}` as any, isSelected, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true
      });
    });
  };

  return (
    <FilterableSelect
      isMulti
      value={selectedActions}
      onChange={handleChange}
      options={actionOptions}
      placeholder="Select actions..."
      isDisabled={isDisabled}
      isClearable={!isDisabled}
      className="w-full"
      menuPosition="fixed"
      {...(menuPortalContainerRef?.current
        ? { menuPortalTarget: menuPortalContainerRef.current }
        : {})}
      components={{
        Option: OptionWithDescription,
        MultiValueRemove,
        MultiValue: MultiValueWithTooltip
      }}
    />
  );
};

export const GeneralPermissionPolicies = <T extends keyof NonNullable<TFormSchema["permissions"]>>({
  subject,
  actions,
  children,
  title,
  description,
  isDisabled,
  isOpen = false,
  onShowAccessTree,
  menuPortalContainerRef
}: Props<T>) => {
  const { control, watch } = useFormContext<TFormSchema>();
  const { fields, remove, insert } = useFieldArray({
    control,
    name: `permissions.${subject}`
  });

  // scott: this is a hacky work-around to resolve bug of fields not updating UI when removed
  const watchFields = useWatch<TFormSchema>({
    control,
    name: `permissions.${subject}`
  });

  if (!watchFields || !Array.isArray(watchFields) || watchFields.length === 0) return null;

  return (
    <UnstableAccordionItem value={subject}>
      <UnstableAccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
        <div className="flex flex-1 items-center gap-2 text-left">
          <div className="flex grow flex-col">
            <span className="text-base select-none">{title}</span>
            <span className="text-sm text-muted">{description}</span>
          </div>
          {fields.length > 1 && (
            <Badge variant="neutral" className="mr-2">
              {fields.length} Rules
            </Badge>
          )}
          {isOpen && (
            <div className="flex items-center gap-2">
              {onShowAccessTree && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowAccessTree(subject);
                  }}
                >
                  <NetworkIcon className="size-4" />
                  Visualize Access
                </Button>
              )}
              {!isDisabled && isConditionalSubjects(subject) && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    const defaultRule = actions.reduce(
                      (acc, { value }) => {
                        if (typeof value === "string") acc[value] = false;
                        return acc;
                      },
                      {} as Record<string, boolean>
                    );
                    insert(fields.length, [defaultRule as any]);
                  }}
                  isDisabled={isDisabled}
                >
                  <PlusIcon className="size-4" />
                  Add Rule
                </Button>
              )}
            </div>
          )}
        </div>
      </UnstableAccordionTrigger>
      <UnstableAccordionContent className="!p-0">
        <div key={`select-${subject}-type`} className="flex flex-col space-y-3 bg-container p-3">
          {fields.map((el, rootIndex) => {
            const isInverted = watch(`permissions.${subject}.${rootIndex}.inverted` as any);

            return (
              <Fragment key={el.id}>
                {rootIndex > 0 && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 border-t border-border" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <Badge variant="neutral" className="text-xs">
                            or
                          </Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-wrap">
                        At least one rule must match for this permission to apply
                      </TooltipContent>
                    </Tooltip>
                    <div className="flex-1 border-t border-border" />
                  </div>
                )}
                <div
                  className={twMerge(
                    "relative rounded-md border border-l-[6px] border-border bg-card px-5 py-4 transition-colors duration-300",
                    isInverted ? "border-l-red-600/50" : "border-l-green-600/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isConditionalSubjects(subject) && (
                      <Controller
                        defaultValue={false as any}
                        name={`permissions.${subject}.${rootIndex}.inverted`}
                        render={({ field }) => (
                          <Select
                            value={String(field.value)}
                            onValueChange={(val) => field.onChange(val === "true")}
                            disabled={isDisabled}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              <SelectItem value="false">Allow</SelectItem>
                              <SelectItem value="true">Forbid</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )}
                    <div className="flex-1">
                      <ActionsMultiSelect
                        subject={subject}
                        rootIndex={rootIndex}
                        actions={actions}
                        isDisabled={isDisabled}
                        control={control}
                        menuPortalContainerRef={menuPortalContainerRef}
                      />
                    </div>
                    {!isDisabled && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <UnstableIconButton
                            aria-label="Remove rule"
                            variant="danger"
                            onClick={() => remove(rootIndex)}
                            isDisabled={isDisabled}
                          >
                            <TrashIcon className="size-4" />
                          </UnstableIconButton>
                        </TooltipTrigger>
                        <TooltipContent side="top">Remove Rule</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {children &&
                    cloneElement(children, {
                      position: rootIndex
                    })}
                </div>
              </Fragment>
            );
          })}
        </div>
      </UnstableAccordionContent>
    </UnstableAccordionItem>
  );
};
