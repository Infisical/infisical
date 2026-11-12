import * as React from "react";

import { useDiscardChangesGuard } from "../hooks/use-discard-changes-guard";
import { useDescendantFlags } from "../lib/descendant-flags";
import { useFieldControlAttributes } from "../lib/field-context";
import { type OptionCreateHandler, useOptionCreation } from "../lib/use-option-creation";
import { cn } from "../lib/utils";
import { DiscardChangesAlertDialog } from "./alert-dialog";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./dialog";
import { Icon } from "./icon";
import { fieldBoxFlags, fieldBoxWatch } from "./input";
import { MultiSelect } from "./multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Spinner } from "./spinner";
import { Highlight } from "./text";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";
import styles from "./picker.module.css";

export type ComboboxOption = { value: string; label: string; meta?: string; disabled?: boolean };
export type ComboboxCreationFormProps = {
  /** The trimmed search text when the row was chosen, for prefilling a name. */
  query: string;
  /** Give the form element this id; the dialog's submit button targets it. */
  formId: string;
  /** Select the created option and close the dialog. Ignored once the dialog was dismissed. */
  complete: (option: ComboboxOption) => void;
  /** Close the dialog, asking first when the form reported unsaved changes. */
  dismiss: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  /** Relabel the submit button while this form is open; undefined goes back to submitLabel. */
  onSubmitLabelChange: (label: string | undefined) => void;
};
export type ComboboxCreation =
  | {
      mode: "inline";
      onCreate: OptionCreateHandler;
      /** Keeps the Create row visible but disabled, with this reason beside it. */
      disabledReason?: string;
    }
  | {
      mode: "dialog";
      /** The row label, for example Create connection. */
      label: string;
      title: string;
      description?: string;
      submitLabel?: string;
      renderForm: (props: ComboboxCreationFormProps) => React.ReactNode;
      /** Keeps the Create row visible but disabled, with this reason beside it. */
      disabledReason?: string;
      discardTitle?: string;
      discardDescription?: string;
    };
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
  defaultOpen?: boolean;
  closeOnFocusOutside?: boolean;
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
        onSearch?: (query: string) => void;
        loading?: boolean;
        creation?: ComboboxCreation;
      }
    | {
        multiple: true;
        value?: string[];
        defaultValue?: string[];
        onChange?: (value: string[]) => void;
        onValueChange?: (value: string[]) => void;
        clearable?: boolean;
        onSearch?: never;
        loading?: never;
        creation?: never;
      }
  );
export function Combobox({
  ref,
  ...props
}: ComboboxProps & { ref?: React.Ref<HTMLButtonElement> }) {
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
  const onSearch = props.multiple ? undefined : props.onSearch;
  const loading = !props.multiple && Boolean(props.loading);
  const creationConfig = props.multiple ? undefined : props.creation;
  const dialogCreation = creationConfig?.mode === "dialog" ? creationConfig : undefined;
  const inlineCreate = creationConfig?.mode === "inline" ? creationConfig.onCreate : onCreate;
  const creationBlocked = creationConfig?.disabledReason || undefined;
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
  const [open, setOpen] = React.useState(props.defaultOpen ?? false);
  const closeOnFocusOutside = props.closeOnFocusOutside ?? !props.defaultOpen;
  const fieldRef = React.useRef<HTMLDivElement>(null);
  const fieldBoxRef = useDescendantFlags(fieldBoxFlags, fieldBoxWatch, fieldRef);
  const refocus = React.useRef<string | null | undefined>(undefined);
  React.useLayoutEffect(() => {
    if (refocus.current === undefined) return;
    const target = refocus.current;
    refocus.current = undefined;
    const chip = Array.from(
      fieldRef.current?.querySelectorAll<HTMLButtonElement>("[data-slot=combobox-chip-remove]") ??
        []
    ).find((button) => button.dataset.value === target);
    (
      chip ?? fieldRef.current?.querySelector<HTMLButtonElement>("[data-slot=multi-select]")
    )?.focus();
  });
  const isLocked = (value: string) =>
    disabled || Boolean(options.find((option) => option.value === value)?.disabled);
  const remove = (value: string) => {
    const index = selected.indexOf(value);
    refocus.current =
      selected.slice(index + 1).find((item) => !isLocked(item)) ??
      selected
        .slice(0, index)
        .reverse()
        .find((item) => !isLocked(item)) ??
      null;
    apply(selected.filter((item) => item !== value));
  };
  const contentId = React.useId();
  const [query, setQuery] = React.useState("");
  const creation = useOptionCreation(inlineCreate, () => changeOpen(false));
  const { creating, error } = creation;
  const changeQuery = (next: string) => {
    creation.cancel();
    setQuery(next);
    onSearch?.(next);
  };
  const changeOpen = (next: boolean) => {
    creation.cancel();
    setOpen(next);
    if (next || !query) return;
    setQuery("");
    onSearch?.("");
  };
  const [picked, setPicked] = React.useState<ComboboxOption>();
  const selectedOption =
    options.find((option) => option.value === selected[0]) ??
    (picked?.value === selected[0] ? picked : undefined);
  const filtered = onSearch
    ? options
    : options.filter((option) =>
        `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(query.toLowerCase())
      );
  const canCreate =
    inlineCreate &&
    query.trim() &&
    !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase());
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const formId = React.useId();
  const sessionRef = React.useRef(0);
  const [session, setSession] = React.useState<{ id: number; query: string; open: boolean }>();
  const [formDirty, setFormDirty] = React.useState(false);
  const [formPending, setFormPending] = React.useState(false);
  const [formSubmitLabel, setFormSubmitLabel] = React.useState<string>();
  const closeDialog = () => {
    sessionRef.current += 1;
    setSession((current) => current && { ...current, open: false });
    setFormDirty(false);
    setFormPending(false);
  };
  const guard = useDiscardChangesGuard({ isDirty: formDirty, onDiscard: closeDialog });
  const openDialog = () => {
    sessionRef.current += 1;
    setSession({ id: sessionRef.current, query: query.trim(), open: true });
    setFormDirty(false);
    setFormPending(false);
    setFormSubmitLabel(undefined);
    changeOpen(false);
  };
  const complete = (id: number, option: ComboboxOption) => {
    if (id !== sessionRef.current) return;
    setPicked(option);
    apply([option.value]);
    closeDialog();
  };
  if (props.multiple)
    return (
      <div
        ref={fieldBoxRef}
        className={cn(controlStyles.field, styles.multiCombobox)}
        data-size="sm"
        data-field-box=""
      >
        {selected.map((value) => {
          const chipLabel = options.find((option) => option.value === value)?.label ?? value;
          return (
            <span key={value} className={styles.chip} data-locked={isLocked(value) || undefined}>
              <span title={chipLabel}>{chipLabel}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${chipLabel}`}
                data-slot="combobox-chip-remove"
                data-value={value}
                disabled={isLocked(value)}
                onClick={() => remove(value)}
                onKeyDown={(event) => {
                  if (event.key !== "Backspace" && event.key !== "Delete") return;
                  event.preventDefault();
                  remove(value);
                }}
              >
                <Icon name="x" size={12} />
              </Button>
            </span>
          );
        })}
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
          quickActions={false}
          anchorRef={fieldRef}
          defaultOpen={props.defaultOpen}
          closeOnFocusOutside={closeOnFocusOutside}
          renderValue={selected.length ? () => null : undefined}
          onCreate={onCreate}
          className={className}
          onEmptyBackspace={() => {
            const last = selected[selected.length - 1];
            if (last && !options.find((option) => option.value === last)?.disabled)
              apply(selected.slice(0, -1));
          }}
        />
        {props.clearable && selected.some((value) => !isLocked(value)) && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-slot="combobox-clear"
            onClick={() => {
              refocus.current = null;
              apply(selected.filter(isLocked));
            }}
          >
            Clear all
          </Button>
        )}
      </div>
    );
  const trigger = (
    <PopoverTrigger asChild>
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof ref === "function") return ref(node);
          if (ref) ref.current = node;
          return undefined;
        }}
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
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          changeOpen(true);
        }}
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
      <PopoverContent
        id={contentId}
        align="start"
        surface="menu"
        onFocusOutside={(event) => {
          if (!closeOnFocusOutside) event.preventDefault();
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={changeQuery}
            placeholder="Search options"
            aria-label={`Search ${label}`}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) event.stopPropagation();
            }}
            trailing={loading ? <Spinner /> : undefined}
          />
          <CommandList aria-busy={loading || undefined}>
            {!onSearch && !dialogCreation && <CommandEmpty>{emptyText}</CommandEmpty>}
            {(onSearch || dialogCreation) && !filtered.length && (
              <p role="status" data-slot="combobox-status" className={menu.empty}>
                {loading ? "Searching…" : emptyText}
              </p>
            )}
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled || disabled}
                  data-checked={selected.includes(option.value)}
                  onSelect={() => {
                    setPicked(option);
                    apply([option.value]);
                    changeOpen(false);
                  }}
                >
                  <span className={menu.title}>
                    <Highlight text={option.label} query={query} />
                  </span>
                  {option.meta && <span className={menu.meta}>{option.meta}</span>}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  disabled={creating || loading || disabled || Boolean(creationBlocked)}
                  value={`create:${query}`}
                  onSelect={() => {
                    creation.create(query.trim());
                  }}
                >
                  <span className={menu.title}>
                    {creating ? "Creating…" : `Create "${query.trim()}"`}
                  </span>
                  {creationBlocked && <span className={menu.meta}>{creationBlocked}</span>}
                </CommandItem>
              )}
            </CommandGroup>
            {dialogCreation && (
              <>
                {filtered.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  <CommandItem
                    value="combobox-create-dialog"
                    data-slot="combobox-create"
                    disabled={disabled || Boolean(creationBlocked)}
                    onSelect={openDialog}
                  >
                    <Icon name="plus" />
                    <span className={menu.title}>{dialogCreation.label}</span>
                    {creationBlocked && <span className={menu.meta}>{creationBlocked}</span>}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </PopoverContent>
      {dialogCreation && session && (
        <>
          <Dialog
            open={session.open}
            onOpenChange={(next) => {
              if (!next) guard.requestDiscard();
            }}
          >
            <DialogContent
              pending={formPending}
              onSubmit={(event) => event.stopPropagation()}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                triggerRef.current?.focus();
              }}
            >
              <DialogHeader>
                <DialogTitle>{dialogCreation.title}</DialogTitle>
                {dialogCreation.description && (
                  <DialogDescription>{dialogCreation.description}</DialogDescription>
                )}
              </DialogHeader>
              <React.Fragment key={session.id}>
                {dialogCreation.renderForm({
                  query: session.query,
                  formId,
                  complete: (option) => complete(session.id, option),
                  dismiss: guard.requestDiscard,
                  onDirtyChange: setFormDirty,
                  onPendingChange: setFormPending,
                  onSubmitLabelChange: setFormSubmitLabel
                })}
              </React.Fragment>
              <DialogFooter>
                <Button variant="outline" disabled={formPending} onClick={guard.requestDiscard}>
                  Cancel
                </Button>
                <Button type="submit" form={formId} loading={formPending}>
                  {formSubmitLabel ?? dialogCreation.submitLabel ?? "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <DiscardChangesAlertDialog
            {...guard.discardDialogProps}
            title={dialogCreation.discardTitle}
            description={dialogCreation.discardDescription}
          />
        </>
      )}
    </Popover>
  );
}
Combobox.displayName = "Combobox";

export const ComboboxInput = CommandInput;
export const ComboboxContent = PopoverContent;
export const ComboboxTrigger = PopoverTrigger;
export const ComboboxList = CommandList;
export const ComboboxItem = CommandItem;
export const ComboboxEmpty = CommandEmpty;
export const ComboboxGroup = CommandGroup;
export const ComboboxSeparator = CommandSeparator;
export function ComboboxLabel({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & { ref?: React.Ref<HTMLSpanElement> }) {
  return <span ref={ref} data-slot="combobox-label" {...props} />;
}
ComboboxLabel.displayName = "ComboboxLabel";
export const ComboboxValue = ComboboxLabel;
export const ComboboxCollection = React.Fragment;
export function ComboboxChips({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} data-slot="combobox-chips" className={styles.chips} {...props} />;
}
ComboboxChips.displayName = "ComboboxChips";
export function ComboboxChip({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & { ref?: React.Ref<HTMLSpanElement> }) {
  return <span ref={ref} data-slot="combobox-chip" className={styles.chip} {...props} />;
}
ComboboxChip.displayName = "ComboboxChip";
export const ComboboxChipsInput = CommandInput;
export const useComboboxAnchor = () => React.useRef<HTMLDivElement>(null);
