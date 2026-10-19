import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { useControllableState } from "../lib/use-controllable-state";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "./command";
import { Icon, type IconName } from "./icon";
import { Kbd } from "./kbd";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface SwitcherOption {
  value: string;
  label: ReactNode;
  searchText?: string;
  description?: string;
  media?: ReactNode;
  meta?: ReactNode;
  metaMono?: boolean;
  mono?: boolean;
  group?: string;
  disabled?: boolean;
  keywords?: string[];
}
export interface SwitcherAction {
  label: string;
  icon?: IconName;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}
export type SwitcherActionDivider = { type: "separator" } | { type: "label"; label: ReactNode };
export interface SwitcherProps {
  trigger: ReactElement;
  options: SwitcherOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, option: SwitcherOption) => void;
  actions?: (SwitcherAction | SwitcherActionDivider)[];
  header?: ReactNode;
  footer?: ReactNode | ((api: { close: () => void }) => ReactNode);
  searchable?: boolean;
  placeholder?: string;
  emptyText?: string;
  label: string;
  width?: number;
  maxHeight?: number;
  align?: "start" | "end";
  side?: "bottom" | "top" | "right";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const syncActiveOption = (root: HTMLDivElement) => {
  const list = root.querySelector<HTMLElement>("[cmdk-list]");
  const option = root.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]');
  if (option?.id) list?.setAttribute("aria-activedescendant", option.id);
  else list?.removeAttribute("aria-activedescendant");
};

export const Switcher = ({
  trigger,
  options,
  value,
  defaultValue = "",
  onChange,
  actions = [],
  header,
  footer,
  searchable = options.length > 7,
  placeholder = "Search",
  emptyText = "No matches",
  label,
  width = 280,
  maxHeight = 320,
  align = "start",
  side = "bottom",
  open,
  defaultOpen = false,
  onOpenChange,
  className
}: SwitcherProps) => {
  const [isOpen, setOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange
  });
  const [selected, setSelected] = useControllableState({ value, defaultValue });
  const [query, setQuery] = useState("");
  const command = useRef<HTMLDivElement | null>(null);
  const optionObserver = useRef<MutationObserver | null>(null);
  const attachCommand = useCallback(
    (node: HTMLDivElement | null) => {
      optionObserver.current?.disconnect();
      command.current = node;
      if (node && !searchable) {
        // cmdk can highlight its initial item before it publishes the active option ID.
        const observer = new MutationObserver(() => syncActiveOption(node));
        observer.observe(node, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-selected", "id"]
        });
        syncActiveOption(node);
        optionObserver.current = observer;
      }
    },
    [searchable]
  );
  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);
  const close = () => {
    setQuery("");
    setOpen(false);
  };
  const groups = [...new Set(options.map((option) => option.group ?? ""))];
  return (
    <Popover
      open={isOpen}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className={className}
        align={align}
        side={side}
        style={{ width, padding: 0 }}
        aria-label={label}
        onOpenAutoFocus={(event) => {
          const target = command.current?.querySelector<HTMLElement>(
            searchable ? "[cmdk-input]" : "[cmdk-list]"
          );
          if (target) {
            event.preventDefault();
            if (!searchable && command.current) syncActiveOption(command.current);
            target.focus();
          }
        }}
      >
        {header && <div className="v4-switcher-header">{header}</div>}
        <Command
          ref={attachCommand}
          tabIndex={searchable ? undefined : -1}
          shouldFilter={searchable}
          label={label}
        >
          {searchable && (
            <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          )}
          <CommandEmpty>
            <p role="status">{emptyText}</p>
          </CommandEmpty>
          <CommandList tabIndex={-1} label={label} style={{ maxHeight }}>
            {groups.map((group) => (
              <CommandGroup key={group} heading={group || undefined}>
                {options
                  .filter((option) => (option.group ?? "") === group)
                  .map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      keywords={[
                        option.searchText ??
                          (typeof option.label === "string" ? option.label : option.value),
                        ...(option.keywords ?? [])
                      ]}
                      disabled={option.disabled}
                      data-current={option.value === selected || undefined}
                      onSelect={() => {
                        if (option.value !== selected) {
                          setSelected(option.value);
                          onChange?.(option.value, option);
                        }
                        close();
                      }}
                    >
                      {option.media}
                      <span className={option.mono ? "font-mono" : undefined}>
                        {option.label}
                        {option.description && (
                          <span className="v4-switcher-description">{option.description}</span>
                        )}
                      </span>
                      {option.meta && (
                        <span className={option.metaMono ? "ml-auto font-mono" : "ml-auto"}>
                          {option.meta}
                        </span>
                      )}
                      {option.value === selected && <Icon name="check" label="Current" />}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
            {actions.length > 0 && <CommandSeparator />}
            {actions.map((action, index) =>
              "type" in action ? (
                action.type === "separator" ? (
                  <CommandSeparator key={index} />
                ) : (
                  <CommandGroup key={index} heading={action.label} />
                )
              ) : (
                <CommandItem
                  key={index}
                  value={`action-${index}`}
                  keywords={[action.label]}
                  disabled={action.disabled}
                  data-danger={action.danger || undefined}
                  onSelect={() => {
                    action.onSelect?.();
                    close();
                  }}
                >
                  {action.icon && <Icon name={action.icon} />}
                  {action.label}
                  {action.shortcut && <Kbd>{action.shortcut}</Kbd>}
                </CommandItem>
              )
            )}
          </CommandList>
        </Command>
        {footer && (
          <div className="v4-switcher-footer">
            {typeof footer === "function" ? footer({ close }) : footer}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
