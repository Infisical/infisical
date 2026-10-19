import * as React from "react";

import { useFieldControlAttributes } from "../lib/field-context";
import { useControllableState } from "../lib/use-controllable-state";
import { type OptionCreateHandler, useOptionCreation } from "../lib/use-option-creation";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";
import styles from "./picker.module.css";

export type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
};
type Shared = {
  onCreate?: OptionCreateHandler;
  onEmptyBackspace?: () => void;
  options: readonly MultiSelectOption[];
  label: string;
  id?: string;
  "aria-describedby"?: string;
  placeholder?: string;
  allLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  searchable?: boolean;
  anchorRef?: React.RefObject<HTMLElement>;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderValue?: (selected: readonly MultiSelectOption[]) => React.ReactNode;
  trigger?: React.ReactElement;
  size?: "sm" | "md";
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  menuWidth?: React.CSSProperties["width"];
  className?: string;
};
export type MultiSelectProps = Shared &
  (
    | {
        multiple?: true;
        value?: string[];
        defaultValue?: string[];
        onChange?: (value: string[]) => void;
      }
    | {
        multiple: false;
        value?: string | null;
        defaultValue?: string | null;
        onChange?: (value: string | null) => void;
      }
  );
export const MultiSelect = React.forwardRef<HTMLButtonElement, MultiSelectProps>((props, ref) => {
  const {
    options,
    label,
    placeholder = "Select options",
    allLabel,
    disabled,
    invalid,
    searchable = false,
    anchorRef,
    renderValue,
    trigger,
    size = "sm",
    align = "start",
    side = "bottom",
    menuWidth,
    className
  } = props;
  const optionValues = new Set<string>();
  options.forEach((option) => {
    if (optionValues.has(option.value))
      throw new Error("MultiSelect option values must be unique.");
    optionValues.add(option.value);
  });
  const field = useFieldControlAttributes(props);
  const generated = React.useId();
  const listId = `${generated}-list`;
  const [internal, setInternal] = React.useState<string[] | string | null>(
    props.defaultValue ?? (props.multiple === false ? null : [])
  );
  const current = props.value === undefined ? internal : props.value;
  const selected = Array.isArray(current) ? current : current ? [current] : [];
  const [open, setOpen] = useControllableState({
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange
  });
  const [query, setQuery] = React.useState("");
  const creation = useOptionCreation(props.onCreate, () => setQuery(""));
  const { creating, error: createError } = creation;
  const changeQuery = (next: string) => {
    creation.cancel();
    setQuery(next);
  };
  const changeOpen = (next: boolean) => {
    if (disabled && next) return;
    creation.cancel();
    setOpen(next);
    if (!next) setQuery("");
  };
  React.useLayoutEffect(() => {
    creation.cancel();
  }, [open, disabled, creation.cancel]);
  const canCreate = Boolean(
    props.onCreate &&
      query.trim() &&
      !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase())
  );
  const create = () => {
    if (canCreate && !creating && !disabled) creation.create(query.trim());
  };
  const [active, setActive] = React.useState("");
  const prefix = React.useRef({ value: "", at: 0 });
  const list = React.useRef<HTMLDivElement>(null);
  const search = React.useRef<HTMLInputElement>(null);
  const apply = (values: string[]) => {
    if (disabled) return;
    if (props.multiple === false) {
      const next = values[0] ?? null;
      if (props.value === undefined) setInternal(next);
      props.onChange?.(next);
    } else {
      const included = new Set(values);
      const ordered = options
        .filter((option) => included.has(option.value))
        .map((option) => option.value);
      if (props.value === undefined) setInternal(ordered);
      props.onChange?.(ordered);
    }
  };
  const chosen = options.filter((option) => selected.includes(option.value));
  const firstChosen = chosen[0];
  const eligible = options.filter((option) => !option.disabled);
  const allSelected =
    eligible.length > 0 && eligible.every((option) => selected.includes(option.value));
  let summary: React.ReactNode = placeholder;
  if (renderValue) summary = renderValue(chosen);
  else if (firstChosen) {
    summary =
      props.multiple !== false && allLabel && allSelected ? (
        allLabel
      ) : (
        <span className={styles.summary}>
          <span>{firstChosen.label}</span>
          {chosen.length > 1 && (
            <span className={styles.more} aria-label={`${chosen.length - 1} more selected`}>
              +{chosen.length - 1}
            </span>
          )}
        </span>
      );
  }
  const filtered = options.filter((option) =>
    `${option.label} ${option.description ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );
  const enabled = filtered.filter((option) => !option.disabled && !disabled);
  const currentActive = enabled.find((option) => option.value === active) ?? enabled[0];
  const optionId = (value: string) =>
    `${generated}-option-${options.findIndex((option) => option.value === value)}`;
  React.useEffect(() => {
    if (open && currentActive)
      document.getElementById(optionId(currentActive.value))?.scrollIntoView({ block: "nearest" });
  }, [open, currentActive?.value]);
  const groups = [...new Set(filtered.map((option) => option.group ?? ""))];
  const all = () =>
    apply(
      options
        .filter((option) => !option.disabled || selected.includes(option.value))
        .map((option) => option.value)
    );
  const toggle = (option: MultiSelectOption) => {
    if (option.disabled || disabled) return;
    if (props.multiple === false) {
      apply([option.value]);
      changeOpen(false);
    } else
      apply(
        selected.includes(option.value)
          ? selected.filter((value) => value !== option.value)
          : [...selected, option.value]
      );
  };
  const keydown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "a" &&
      props.multiple !== false
    ) {
      event.preventDefault();
      const enabledValues = options
        .filter((option) => !option.disabled)
        .map((option) => option.value);
      if (enabledValues.length && enabledValues.every((value) => selected.includes(value)))
        apply(selected.filter((value) => !enabledValues.includes(value)));
      else all();
      return;
    }
    if (event.target instanceof HTMLButtonElement) return;
    if (event.key === "Backspace" && !query && props.onEmptyBackspace) {
      event.preventDefault();
      props.onEmptyBackspace();
      return;
    }
    if (event.key === "Enter" && !currentActive && canCreate) {
      event.preventDefault();
      create();
      return;
    }
    const index = enabled.findIndex((option) => option.value === currentActive?.value);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        enabled[(index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length]
          ?.value ?? ""
      );
    } else if ((event.key === "Home" || event.key === "End") && event.target !== search.current) {
      event.preventDefault();
      setActive((event.key === "Home" ? enabled[0] : enabled[enabled.length - 1])?.value ?? "");
    } else if (
      (event.key === "Enter" || (event.key === " " && event.target !== search.current)) &&
      currentActive
    ) {
      event.preventDefault();
      toggle(currentActive);
    } else if (
      !searchable &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = Date.now();
      prefix.current = {
        value:
          (now - prefix.current.at < 500 ? prefix.current.value : "") + event.key.toLowerCase(),
        at: now
      };
      const found = enabled.find((option) =>
        option.label.toLowerCase().startsWith(prefix.current.value)
      );
      if (found) setActive(found.value);
    }
  };
  return (
    <Popover open={open && !disabled} onOpenChange={changeOpen}>
      {anchorRef && <PopoverAnchor virtualRef={anchorRef} />}
      <PopoverTrigger
        ref={ref}
        asChild
        disabled={disabled}
        {...field}
        aria-label={label}
        aria-invalid={invalid || field["aria-invalid"] || undefined}
      >
        {trigger ? (
          React.cloneElement(trigger, {
            ...field,
            disabled: disabled || trigger.props.disabled,
            "aria-disabled": disabled || trigger.props.disabled || trigger.props["aria-disabled"],
            "aria-haspopup": "listbox",
            tabIndex: disabled ? -1 : trigger.props.tabIndex,
            onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
              if (disabled) {
                event.preventDefault();
                event.stopPropagation();
              } else trigger.props.onClickCapture?.(event);
            },
            onKeyDownCapture: (event: React.KeyboardEvent<HTMLElement>) => {
              if (disabled && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                event.stopPropagation();
              } else trigger.props.onKeyDownCapture?.(event);
            },
            id: field.id ?? trigger.props.id,
            "aria-labelledby": field["aria-labelledby"] ?? trigger.props["aria-labelledby"],
            "aria-describedby":
              [field["aria-describedby"], trigger.props["aria-describedby"]]
                .filter(Boolean)
                .join(" ") || undefined,
            "aria-invalid": invalid || field["aria-invalid"] || trigger.props["aria-invalid"]
          })
        ) : (
          <button
            {...field}
            type="button"
            aria-label={label}
            aria-haspopup="listbox"
            disabled={disabled}
            data-slot="multi-select"
            data-side={side}
            data-align={align}
            data-size={size}
            className={cn(
              controlStyles.field,
              controlStyles.trigger,
              controlStyles.insetHover,
              className
            )}
          >
            <span
              className={styles.triggerValue}
              data-slot="multi-select-value"
              data-placeholder={!chosen.length || undefined}
            >
              {summary}
            </span>
            <Icon name="chev-down" className={controlStyles.chevron} />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        surface="menu"
        style={{ width: menuWidth }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (searchable ? search.current : list.current)?.focus();
        }}
        onKeyDown={keydown}
      >
        {searchable && (
          <div className={controlStyles.searchRow} data-slot="multi-select-search">
            <Icon name="search" />
            <input
              ref={search}
              role="combobox"
              aria-label={`Search ${label}`}
              aria-controls={listId}
              aria-expanded={open}
              aria-autocomplete="list"
              aria-activedescendant={currentActive ? optionId(currentActive.value) : undefined}
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Search options"
            />
          </div>
        )}
        <span role="status" aria-live="polite" className="sr-only">
          {selected.length} selected
        </span>
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-multiselectable={props.multiple !== false || undefined}
          tabIndex={0}
          aria-activedescendant={currentActive ? optionId(currentActive.value) : undefined}
          className={cn(menu.list, menu.inset)}
        >
          {groups.map((group) => (
            <div key={group} role="group" aria-label={group || undefined}>
              {group && <div className={menu.label}>{group}</div>}
              {filtered
                .filter((option) => (option.group ?? "") === group)
                .map((option) => (
                  <div
                    key={option.value}
                    id={optionId(option.value)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={selected.includes(option.value)}
                    aria-disabled={option.disabled || undefined}
                    data-active={currentActive?.value === option.value || undefined}
                    className={menu.row}
                    onPointerMove={() => {
                      if (!option.disabled) setActive(option.value);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggle(option)}
                  >
                    <span className={menu.indicator}>
                      {selected.includes(option.value) && <Icon name="check" />}
                    </span>
                    <span className={menu.text}>
                      <span className={menu.title}>{option.label}</span>
                      {option.description && (
                        <span className={menu.description}>{option.description}</span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
        {!filtered.length && <p className={menu.empty}>No options found</p>}
        {canCreate && (
          <div className={menu.footer} data-slot="multi-select-footer">
            {canCreate && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                loading={creating}
                disabled={disabled}
                onClick={create}
              >{`Create "${query.trim()}"`}</Button>
            )}
          </div>
        )}
        {createError && (
          <p role="alert" className={styles.error}>
            {createError}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
});
MultiSelect.displayName = "MultiSelect";
