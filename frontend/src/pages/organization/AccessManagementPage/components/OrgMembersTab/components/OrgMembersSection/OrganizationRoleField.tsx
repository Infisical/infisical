import { type ReactNode } from "react";
import { Info } from "lucide-react";

import {
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

type OrganizationRoleOption = {
  name: string;
  slug: string;
  description?: string;
};

type OrganizationRoleFieldProps<TOption extends OrganizationRoleOption> = {
  id: string;
  options: readonly TOption[];
  value?: TOption;
  onValueChange: (value: TOption) => void;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: ReactNode;
};

export const OrganizationRoleField = <TOption extends OrganizationRoleOption>({
  id,
  options,
  value,
  onValueChange,
  isLoading,
  isError,
  errorMessage
}: OrganizationRoleFieldProps<TOption>) => (
  <Field>
    <FieldLabel htmlFor={id} className="flex items-center gap-1.5">
      Assign organization role
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Info className="size-3 text-muted" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-md">
          Select which organization role you want to assign to the user.
        </TooltipContent>
      </Tooltip>
    </FieldLabel>
    <Combobox
      id={id}
      options={options}
      value={value}
      onValueChange={onValueChange}
      getOptionValue={(option) => option.slug}
      getOptionLabel={(option) => option.name}
      getOptionKeywords={(option) => (option.description ? [option.description] : [])}
      placeholder="Select role..."
      searchPlaceholder="Search roles..."
      searchAriaLabel="Search organization roles"
      emptyMessage="No organization roles found."
      isError={isError}
      isLoading={isLoading}
      modal
      renderOption={(option) => (
        <div className="min-w-0">
          <p className="truncate">{option.name}</p>
          {option.description ? (
            <p className="text-xs leading-4 break-words whitespace-normal text-muted">
              {option.description}
            </p>
          ) : (
            <p className="text-xs leading-4 text-muted/65">No Description</p>
          )}
        </div>
      )}
    />
    <FieldError>{errorMessage}</FieldError>
  </Field>
);
