import { cloneElement, Fragment, RefObject, useEffect, useMemo } from "react";
import {
  Control,
  Controller,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch
} from "react-hook-form";
import { NetworkIcon, PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  IconButton,
  PermissionActionSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionSubjects,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context";

export type TPermissionAction = {
  value: string | number;
  label: string;
  description?: string;
};

type AnyPermissionSubject = ProjectPermissionSub | OrgPermissionSubjects;

type Props<T extends AnyPermissionSubject> = {
  title: string;
  description: string;
  subject: T;
  actions: readonly TPermissionAction[];
  isConditional?: boolean;
  onRemoveLastRule?: () => void;
  children?: JSX.Element;
  isDisabled?: boolean;
  isOpen?: boolean;
  onShowAccessTree?: (subject: string) => void;
  menuPortalContainerRef?: RefObject<HTMLElement | null>;
};

type ActionsMultiSelectProps = {
  subject: string;
  rootIndex: number;
  actions: readonly TPermissionAction[];
  isDisabled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  menuPortalContainerRef?: RefObject<HTMLElement | null>;
};

const ActionsMultiSelect = ({
  subject,
  rootIndex,
  actions,
  isDisabled,
  control,
  menuPortalContainerRef
}: ActionsMultiSelectProps) => {
  const { setValue, trigger } = useFormContext();

  const { errors } = useFormState({
    control,
    name: `permissions.${subject}.${rootIndex}.actionRequired` as any
  });
  const actionsError = (errors?.permissions as any)?.[subject]?.[rootIndex]?.actionRequired;

  const permissionRule = useWatch({
    control,
    name: `permissions.${subject}.${rootIndex}` as any,
    defaultValue: {}
  });

  const rule = permissionRule as Record<string, boolean> | undefined;
  const secretsRead = Boolean(rule?.read);
  const grantPrivilegesSelected = Boolean(rule?.[ProjectPermissionMemberActions.GrantPrivileges]);

  const legacyActionsState = useMemo(
    () => ({
      secretsRead,
      grantPrivilegesSelected
    }),
    [secretsRead, grantPrivilegesSelected]
  );

  // The legacy "grant-privileges" action is superseded by "assign-role" /
  // "assign-additional-privileges" only on project-level member/identity/group
  // subjects, which expose those replacement actions. Org-level identity/group
  // subjects share the same string identifiers but have no replacement and still
  // rely on "grant-privileges", so it must remain selectable there.
  const hasGrantPrivilegesReplacement = useMemo(
    () => actions.some(({ value }) => value === ProjectPermissionMemberActions.AssignRole),
    [actions]
  );

  const visibleActions = useMemo(
    () =>
      actions.filter(({ value }) => {
        if (typeof value !== "string") return false;

        // Hide legacy "read" action for secrets unless already selected
        if (subject === ProjectPermissionSub.Secrets && value === "read") {
          return legacyActionsState.secretsRead;
        }

        // Hide the legacy "grant-privileges" action unless already selected, but
        // only when a replacement action exists (i.e. project subjects).
        if (
          value === ProjectPermissionMemberActions.GrantPrivileges &&
          hasGrantPrivilegesReplacement
        ) {
          return legacyActionsState.grantPrivilegesSelected;
        }

        return true;
      }),
    [actions, subject, legacyActionsState, hasGrantPrivilegesReplacement]
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
    () => actionOptions.filter((opt) => Boolean(rule?.[opt.value])),
    [actionOptions, rule]
  );

  const handleChange = (newValue: unknown) => {
    const selectedArray = Array.isArray(newValue) ? newValue : [];
    visibleActions.forEach(({ value }) => {
      const valueStr = String(value);
      const isSelected = selectedArray.some((s: { value: string }) => s.value === valueStr);
      setValue(`permissions.${subject}.${rootIndex}.${valueStr}` as any, isSelected, {
        shouldDirty: true,
        shouldTouch: true
      });
    });

    trigger("permissions");
  };

  return (
    <div className="flex w-full flex-col">
      <PermissionActionSelect
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
        isError={actionsError}
      />
      {actionsError && (
        <span className="mt-1 text-xs text-danger">{actionsError.message as string}</span>
      )}
    </div>
  );
};

export const GeneralPermissionPolicies = <T extends AnyPermissionSubject>({
  subject,
  actions,
  children,
  title,
  description,
  isConditional,
  onRemoveLastRule,
  isDisabled,
  isOpen = false,
  onShowAccessTree,
  menuPortalContainerRef
}: Props<T>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { control, watch, trigger } = useFormContext<any>();

  useEffect(() => {
    trigger("permissions");
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fields, remove, insert } = useFieldArray<any>({
    control,
    name: `permissions.${subject}`
  });

  // scott: this is a hacky work-around to resolve bug of fields not updating UI when removed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watchFields = useWatch({ control, name: `permissions.${subject}` as any }) as unknown[];

  if (!watchFields || !Array.isArray(watchFields) || watchFields.length === 0) return null;

  return (
    <AccordionItem value={subject}>
      <AccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
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
              {!isDisabled && isConditional && (
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
      </AccordionTrigger>
      <AccordionContent className="!p-0">
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
                    isInverted ? "border-l-danger/50" : "border-l-success/50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {isConditional && (
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
                    {!isDisabled && (fields.length > 1 || isConditional || !!onRemoveLastRule) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            aria-label="Remove rule"
                            variant="danger"
                            onClick={() => {
                              if (fields.length === 1 && onRemoveLastRule) {
                                onRemoveLastRule();
                              } else {
                                remove(rootIndex);
                              }
                            }}
                            isDisabled={isDisabled}
                          >
                            <TrashIcon className="size-4" />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {fields.length === 1 && onRemoveLastRule
                            ? "Remove Policy"
                            : "Remove Rule"}
                        </TooltipContent>
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
      </AccordionContent>
    </AccordionItem>
  );
};
