import * as React from "react";

import { ListHighlight } from "../lib/list-highlight";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { FieldHelp } from "./field";
import { Icon } from "./icon";
import { Input, type InputProps } from "./input";
import { useMenuInset } from "./menu-inset";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";

import helperStyles from "./helpers.module.css";
import menu from "./menu.module.css";
import styles from "./picker.module.css";

export type SecretPathInputProps = Omit<
  InputProps,
  "value" | "defaultValue" | "onChange" | "type" | "role"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Names of the child folders of the folder onParentPathChange last reported. The input filters them by the segment being typed. */
  folders?: readonly string[];
  /** Called on mount and whenever the typed path enters another folder, with that folder's path ("/" or "/app/api"), so the host loads its children into folders. */
  onParentPathChange?: (parentPath: string) => void;
};

const GLOB = /[*?[\]{}]/;

const splitPath = (path: string) => {
  const cut = path.lastIndexOf("/");
  return {
    parent: cut <= 0 ? "/" : path.slice(0, cut),
    segment: path.slice(cut + 1)
  };
};

export function SecretPathInput({
  value: valueProp,
  defaultValue = "/",
  onChange,
  folders = [],
  onParentPathChange,
  mono = true,
  disabled,
  readOnly,
  onFocus,
  onBlur,
  onKeyDown,
  ref,
  ...props
}: SecretPathInputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange
  });
  const { parent, segment } = splitPath(value);
  const report = React.useEffectEvent((next: string) => onParentPathChange?.(next));
  React.useEffect(() => {
    report(parent);
  }, [parent]);
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const anchor = React.useRef<HTMLDivElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const listInset = useMenuInset(list);
  const listId = React.useId();
  const optionId = (index: number) => `${listId}-${index}`;
  const typed = segment.toLowerCase();
  const suggestions = GLOB.test(value)
    ? []
    : [...new Set(folders)]
        .filter((name) => name.toLowerCase().startsWith(typed))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const open = focused && !dismissed && !disabled && !readOnly && suggestions.length > 0;
  const current = open && active < suggestions.length ? active : -1;

  React.useEffect(() => {
    if (current >= 0)
      document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  });

  const change = (next: string) => {
    setValue(next);
    setDismissed(false);
    setActive(-1);
  };
  const choose = (name: string) => change(`${parent === "/" ? "" : parent}/${name}/`);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setDismissed(true);
      }}
    >
      <PopoverAnchor asChild>
        <div ref={anchor} data-slot="secret-path-input" className={styles.pathAnchor}>
          <Input
            ref={ref}
            {...props}
            type="text"
            role="combobox"
            mono={mono}
            disabled={disabled}
            readOnly={readOnly}
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
            value={value}
            onChange={(event) => change(event.target.value)}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              setDismissed(false);
              setActive(-1);
              onBlur?.(event);
            }}
            onKeyDown={(event) => {
              onKeyDown?.(event);
              if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229)
                return;
              const arrow = event.key === "ArrowDown" || event.key === "ArrowUp";
              if (!open && arrow && dismissed && suggestions.length > 0) {
                event.preventDefault();
                setDismissed(false);
                return;
              }
              if (!open) return;
              const count = suggestions.length;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current + 1) % count);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive(current <= 0 ? count - 1 : current - 1);
              } else if (event.key === "Enter" && current >= 0) {
                event.preventDefault();
                choose(suggestions[current]);
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        surface="menu"
        className={styles.pathList}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (anchor.current?.contains(event.target as Node)) event.preventDefault();
        }}
      >
        <div
          ref={listInset}
          id={listId}
          role="listbox"
          aria-label="Folders"
          data-scroll-fade="y"
          className={cn(menu.list, menu.inset)}
        >
          {suggestions.map((name, index) => (
            <div
              key={name}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={index === current}
              data-active={index === current || undefined}
              className={cn(menu.row, styles.option)}
              onPointerMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(name)}
            >
              <Icon name="folder" />
              <span className={styles.optionLabel}>{name}</span>
            </div>
          ))}
          <ListHighlight />
        </div>
      </PopoverContent>
    </Popover>
  );
}
SecretPathInput.displayName = "SecretPathInput";

export function GlobPatternHelp({ label = "Glob patterns" }: { label?: string }) {
  return (
    <FieldHelp label={label}>
      <span className={helperStyles.globHelp}>
        <span>
          <code>*</code> matches any characters inside one folder.
        </span>
        <span>
          <code>**</code> matches any number of nested folders.
        </span>
        <span>
          <code>/app/*</code> matches the folders directly inside <code>/app</code>.
        </span>
        <span>
          <code>/app/**</code> matches <code>/app</code> and everything under it.
        </span>
      </span>
    </FieldHelp>
  );
}
GlobPatternHelp.displayName = "GlobPatternHelp";
