import * as React from "react";

import { useFieldControlAttributes } from "../lib/field-context";
import { type OptionCreateHandler, useOptionCreation } from "../lib/use-option-creation";
import { cn } from "../lib/utils";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "./command";
import { Icon } from "./icon";
import { MultiSelect } from "./multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";
import styles from "./picker.module.css";

export type ComboboxOption = { value: string; label: string; meta?: string; disabled?: boolean };
type SharedComboboxProps = {
  options: readonly ComboboxOption[];
  placeholder?: string;
  label: string;
  id?: string;
  "aria-describedby"?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  mono?: boolean;
  onCreate?: OptionCreateHandler;
  className?: string;
};
export type ComboboxProps = SharedComboboxProps &
  (
    | {
        multiple?: false;
        value?: string;
        defaultValue?: string;
        onChange?: (value: string) => void;
        onValueChange?: (value: string) => void;
      }
    | {
        multiple: true;
        value?: string[];
        defaultValue?: string[];
        onChange?: (value: string[]) => void;
        onValueChange?: (value: string[]) => void;
      }
  );
export const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>((props, ref) => {
  const {
    options,
    placeholder = "Select an option",
    label,
    emptyText = "No options found",
    disabled,
    invalid,
    mono,
    onCreate,
    className
  } = props;
  const field = useFieldControlAttributes(props);
  const [internal, setInternal] = React.useState<string | string[]>(
    props.defaultValue ?? (props.multiple ? [] : "")
  );
  const current = props.value === undefined ? internal : props.value;
  const selected = Array.isArray(current) ? current : current ? [current] : [];
  const apply = (next: string[]) => {
    if (props.multiple) {
      if (props.value === undefined) setInternal(next);
      props.onChange?.(next);
      props.onValueChange?.(next);
    } else {
      const value = next[0] ?? "";
      if (props.value === undefined) setInternal(value);
      props.onChange?.(value);
      props.onValueChange?.(value);
    }
  };
  const [open, setOpen] = React.useState(false);
  const fieldRef = React.useRef<HTMLDivElement>(null);
  const contentId = React.useId();
  const [query, setQuery] = React.useState("");
  const creation = useOptionCreation(onCreate, () => changeOpen(false));
  const { creating, error } = creation;
  const changeQuery = (next: string) => {
    creation.cancel();
    setQuery(next);
  };
  const changeOpen = (next: boolean) => {
    creation.cancel();
    setOpen(next);
    if (!next) setQuery("");
  };
  const selectedOption = options.find((option) => option.value === selected[0]);
  const filtered = options.filter((option) =>
    `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );
  const canCreate =
    onCreate &&
    query.trim() &&
    !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase());
  if (props.multiple)
    return (
      <div ref={fieldRef} className={cn(controlStyles.field, styles.multiCombobox)} data-size="sm">
        {selected.map((value) => (
          <span key={value} className={styles.chip}>
            <span>{options.find((option) => option.value === value)?.label ?? value}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${options.find((option) => option.value === value)?.label ?? value}`}
              disabled={disabled || options.find((option) => option.value === value)?.disabled}
              onClick={() => apply(selected.filter((item) => item !== value))}
            >
              <Icon name="x" size={12} />
            </Button>
          </span>
        ))}
        <MultiSelect
          ref={ref}
          id={props.id}
          aria-describedby={props["aria-describedby"]}
          options={options.map((option) => ({ ...option, description: option.meta }))}
          value={selected}
          onChange={apply}
          label={label}
          placeholder={placeholder}
          disabled={disabled}
          invalid={invalid}
          searchable
          anchorRef={fieldRef}
          renderValue={selected.length ? () => null : undefined}
          onCreate={onCreate}
          className={className}
          onEmptyBackspace={() => {
            const last = selected[selected.length - 1];
            if (last && !options.find((option) => option.value === last)?.disabled)
              apply(selected.slice(0, -1));
          }}
        />
      </div>
    );
  const trigger = (
    <PopoverTrigger asChild>
      <button
        ref={ref}
        {...field}
        type="button"
        role="combobox"
        data-size="sm"
        data-placeholder={selected.length ? undefined : ""}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        aria-invalid={invalid || field["aria-invalid"] || undefined}
        disabled={disabled}
        className={cn(controlStyles.field, controlStyles.trigger, mono && styles.mono, className)}
      >
        <span>{selectedOption?.label ?? (selected[0] || placeholder)}</span>
        <Icon name="chev-down" className={controlStyles.chevron} />
      </button>
    </PopoverTrigger>
  );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!disabled) changeOpen(next);
      }}
    >
      {trigger}
      <PopoverContent id={contentId} align="start" surface="menu">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={changeQuery}
            placeholder="Search options"
            aria-label={`Search ${label}`}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) event.stopPropagation();
            }}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled || disabled}
                  data-checked={selected.includes(option.value)}
                  onSelect={() => {
                    apply([option.value]);
                    changeOpen(false);
                  }}
                >
                  <span className={menu.title}>{markComboboxLabel(option.label, query)}</span>
                  {option.meta && <span className={menu.meta}>{option.meta}</span>}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  disabled={creating || disabled}
                  value={`create:${query}`}
                  onSelect={() => {
                    creation.create(query.trim());
                  }}
                >
                  <span className={menu.title}>
                    {creating ? "Creating…" : `Create "${query.trim()}"`}
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
});
Combobox.displayName = "Combobox";
function markComboboxLabel(label: string, query: string) {
  const index = label.toLowerCase().indexOf(query.toLowerCase());
  return !query || index < 0 ? (
    label
  ) : (
    <>
      {label.slice(0, index)}
      <mark className={styles.match}>{label.slice(index, index + query.length)}</mark>
      {label.slice(index + query.length)}
    </>
  );
}

export const ComboboxInput = CommandInput;
export const ComboboxContent = PopoverContent;
export const ComboboxTrigger = PopoverTrigger;
export const ComboboxList = CommandList;
export const ComboboxItem = CommandItem;
export const ComboboxEmpty = CommandEmpty;
export const ComboboxGroup = CommandGroup;
export const ComboboxSeparator = CommandSeparator;
export const ComboboxLabel = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span">
>((props, ref) => <span ref={ref} data-slot="combobox-label" {...props} />);
ComboboxLabel.displayName = "ComboboxLabel";
export const ComboboxValue = ComboboxLabel;
export const ComboboxCollection = React.Fragment;
export const ComboboxChips = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>((props, ref) => <div ref={ref} data-slot="combobox-chips" className={styles.chips} {...props} />);
ComboboxChips.displayName = "ComboboxChips";
export const ComboboxChip = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span">
>((props, ref) => <span ref={ref} data-slot="combobox-chip" className={styles.chip} {...props} />);
ComboboxChip.displayName = "ComboboxChip";
export const ComboboxChipsInput = CommandInput;
export const useComboboxAnchor = () => React.useRef<HTMLDivElement>(null);
