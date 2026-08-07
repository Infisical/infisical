import { ReactNode } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { ChevronDownIcon, ClockIcon } from "lucide-react";
import ms from "ms";

import { TtlFormLabel } from "@app/components/features";
import {
  Badge,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { getDurationDisplay, isValidTemporaryRange, TEMPORARY_RANGE_ERROR } from "./roleAssignment";

type RoleForSelect = { slug: string; name: string; id: string };

type Props = {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  /** Field path prefix: "" for a flat single-role form, `roles.${index}.` for a multi-role array. */
  namePrefix?: string;
  /** Field editors stack rows; only the first row shows its labels. */
  showLabels?: boolean;
  isEditDisabled: boolean;
  assignableRoleSlugs: Set<string>;
  getRolesForSelect: (currentSlug: string) => RoleForSelect[];
  /** Trailing control rendered after the duration field, e.g. a remove-row button. */
  action?: ReactNode;
};

export const RoleAssignmentRow = ({
  control,
  setValue,
  namePrefix = "",
  showLabels = true,
  isEditDisabled,
  assignableRoleSlugs,
  getRolesForSelect,
  action
}: Props) => {
  const slugName = `${namePrefix}slug`;
  const temporaryAccessName = `${namePrefix}temporaryAccess`;
  const temporaryRangeName = `${namePrefix}temporaryAccess.temporaryRange`;

  const temporaryAccess = useWatch({ control, name: temporaryAccessName });
  const isTemporary = Boolean(temporaryAccess?.isTemporary);
  const { variant, text, tooltip, isExpired } = getDurationDisplay(temporaryAccess);

  return (
    <div className="flex items-end gap-2">
      <Controller
        control={control}
        name={slugName}
        render={({ field }) => {
          const rolesForSelect = getRolesForSelect(field.value);
          return (
            <Field className="min-w-0 flex-1">
              {showLabels && <FieldLabel>Role</FieldLabel>}
              <Select value={field.value} onValueChange={field.onChange} disabled={isEditDisabled}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[70]">
                  {rolesForSelect.map(({ name, slug, id }) => {
                    const isAssignable = assignableRoleSlugs.has(slug);
                    return (
                      <SelectItem
                        value={slug}
                        key={id}
                        disabled={!isAssignable}
                        description={
                          isAssignable ? undefined : "You don't have permission to assign this role"
                        }
                      >
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
          );
        }}
      />
      <Field className="w-44 shrink-0">
        {showLabels && <FieldLabel>Duration</FieldLabel>}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={variant}
                  isDisabled={isEditDisabled}
                  className="w-full capitalize"
                >
                  {isTemporary && <ClockIcon />}
                  {text}
                  <ChevronDownIcon />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
          <PopoverContent
            side="right"
            className="z-[70]"
            onWheel={(e) => e.stopPropagation()}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex flex-col space-y-4">
              <div className="border-b border-b-border pb-2 text-sm text-muted">
                Configure Timed Access
              </div>
              {isExpired && <Badge variant="danger">Expired</Badge>}
              <Controller
                control={control}
                defaultValue="1h"
                name={temporaryRangeName}
                render={({ field, fieldState: { error } }) => {
                  // The schema blocks an invalid range on save; this surfaces the same message
                  // while the user is still typing, before the value has been granted.
                  const isInvalid = Boolean(field.value) && !isValidTemporaryRange(field.value);
                  const errorMessage = isInvalid ? TEMPORARY_RANGE_ERROR : error?.message;

                  return (
                    <>
                      <Field>
                        <FieldLabel>
                          <TtlFormLabel label="Validity" />
                        </FieldLabel>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          isError={Boolean(errorMessage)}
                        />
                        {errorMessage && <FieldError>{errorMessage}</FieldError>}
                      </Field>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="xs"
                          variant="outline"
                          isDisabled={!isValidTemporaryRange(field.value)}
                          onClick={() => {
                            const temporaryRange = field.value;
                            setValue(
                              temporaryAccessName,
                              {
                                isTemporary: true,
                                temporaryAccessStartTime: new Date().toISOString(),
                                temporaryRange,
                                temporaryAccessEndTime: new Date(
                                  new Date().getTime() + ms(temporaryRange)
                                ).toISOString()
                              },
                              { shouldDirty: true }
                            );
                          }}
                        >
                          {isTemporary ? "Restart" : "Grant"}
                        </Button>
                        {isTemporary && (
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() =>
                              setValue(
                                temporaryAccessName,
                                { isTemporary: false },
                                { shouldDirty: true }
                              )
                            }
                          >
                            Revoke Access
                          </Button>
                        )}
                      </div>
                    </>
                  );
                }}
              />
            </div>
          </PopoverContent>
        </Popover>
      </Field>
      {action}
    </div>
  );
};
