import { Combobox, type ComboboxMultipleProps } from "../generic/Combobox";
import { Tooltip, TooltipContent, TooltipTrigger } from "../generic/Tooltip";

export type PermissionActionOption = {
  label: string;
  value: string;
  description?: string;
};

type PermissionActionSelectProps<T extends PermissionActionOption> = Omit<
  ComboboxMultipleProps<T>,
  | "getOptionKeywords"
  | "getOptionLabel"
  | "getOptionValue"
  | "multiple"
  | "renderOption"
  | "renderValue"
>;

export const PermissionActionSelect = <T extends PermissionActionOption>({
  clearAriaLabel = "Clear all permission actions",
  emptyMessage = "No permission actions found.",
  searchAriaLabel = "Search permission actions",
  searchPlaceholder = "Search actions...",
  ...props
}: PermissionActionSelectProps<T>) => (
  <Combobox
    {...props}
    multiple
    clearAriaLabel={clearAriaLabel}
    emptyMessage={emptyMessage}
    searchAriaLabel={searchAriaLabel}
    searchPlaceholder={searchPlaceholder}
    getOptionValue={(option) => option.value}
    getOptionLabel={(option) => option.label}
    getOptionKeywords={(option) => (option.description ? [option.description] : [])}
    renderOption={(option) => (
      <div className="min-w-0">
        <p className="truncate">{option.label}</p>
        {option.description && (
          <p className="text-xs leading-4 break-words whitespace-normal text-muted">
            {option.description}
          </p>
        )}
      </div>
    )}
    renderValue={(option) =>
      option.description ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{option.label}</span>
          </TooltipTrigger>
          <TooltipContent>{option.description}</TooltipContent>
        </Tooltip>
      ) : (
        option.label
      )
    }
  />
);
