import { useEffect, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { EllipsisIcon } from "lucide-react";

import {
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";

export type RowAction = {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  group?: string;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  focusOnClose?: boolean;
};

type Props = {
  label: string;
  actions: RowAction[];
  onCloseAutoFocus?: (event: Event) => void;
};

export const RowActionMenu = ({ label, actions, onCloseAutoFocus }: Props) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingFocusAction = useRef<(() => void) | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const openAt = (x: number, y: number) => {
    triggerRef.current?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })
    );
  };

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse), (max-width: 640px)");
    const update = () => setIsTouch(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const row = triggerRef.current?.closest("tr");
    if (!row) return undefined;

    const openFromRow = (event: MouseEvent) => {
      if (
        (event.target as HTMLElement).closest(
          "button, input, textarea, select, a, [contenteditable], [role='button'], [role='menu'], [data-row-action-trigger]"
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (isTouch) setIsOpen(true);
      else openAt(event.clientX, event.clientY);
    };

    const openFromKeyboard = (event: KeyboardEvent) => {
      if (
        (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) &&
        !(event.target as HTMLElement).closest("input, textarea, select, [contenteditable]")
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (isTouch) setIsOpen(true);
        else {
          const rect = triggerRef.current?.getBoundingClientRect();
          if (rect) openAt(rect.left, rect.bottom);
        }
      }
    };

    row.addEventListener("contextmenu", openFromRow);
    row.addEventListener("keydown", openFromKeyboard);
    return () => {
      row.removeEventListener("contextmenu", openFromRow);
      row.removeEventListener("keydown", openFromKeyboard);
    };
  }, [isTouch]);

  const select = (action: RowAction) => {
    if (action.disabled) return;
    setIsOpen(false);
    if (action.focusOnClose) pendingFocusAction.current = action.onSelect;
    else action.onSelect();
  };

  const restoreFocus = (event: Event) => {
    if (pendingFocusAction.current) {
      event.preventDefault();
      pendingFocusAction.current();
      pendingFocusAction.current = null;
    } else if (!document.querySelector("[role='dialog'][data-state='open']")) {
      triggerRef.current?.focus();
    }
  };

  let lastGroup: string | undefined;

  return (
    <>
      <ContextMenu.Root onOpenChange={setIsOpen}>
        <ContextMenu.Trigger asChild>
          <IconButton
            ref={triggerRef}
            data-row-action-trigger=""
            aria-label={`More actions for ${label}`}
            variant="ghost"
            size="xs"
            className="size-11 shrink-0 sm:size-9"
            onClick={(event) => {
              event.stopPropagation();
              if (isTouch) setIsOpen(true);
              else {
                const rect = event.currentTarget.getBoundingClientRect();
                openAt(rect.left, rect.bottom);
              }
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (
                event.key === "Enter" ||
                event.key === " " ||
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10")
              ) {
                event.preventDefault();
                if (isTouch) setIsOpen(true);
                else {
                  const rect = event.currentTarget.getBoundingClientRect();
                  openAt(rect.left, rect.bottom);
                }
              }
            }}
          >
            <EllipsisIcon />
          </IconButton>
        </ContextMenu.Trigger>
        {!isTouch && (
          <ContextMenu.Portal>
            <ContextMenu.Content
              collisionPadding={8}
              className="z-[var(--z-index-dropdown)] max-h-[min(80vh,var(--radix-context-menu-content-available-height))] thin-scrollbar min-w-52 overflow-y-auto rounded-popover border border-border bg-popover p-1.5 text-sm text-foreground shadow-md"
              onCloseAutoFocus={(event) => {
                onCloseAutoFocus?.(event);
                if (!event.defaultPrevented) restoreFocus(event);
              }}
            >
              {actions.map((action, index) => {
                const changedGroup = action.group !== lastGroup;
                lastGroup = action.group;
                return (
                  <div key={`${action.group ?? ""}-${action.label}`}>
                    {changedGroup && index > 0 && (
                      <ContextMenu.Separator className="my-1 h-px bg-border" />
                    )}
                    {changedGroup && action.group && (
                      <ContextMenu.Label className="px-2 py-1 text-xs text-muted">
                        {action.group}
                      </ContextMenu.Label>
                    )}
                    <ContextMenu.Item
                      disabled={action.disabled}
                      className={`relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 outline-0 focus:bg-foreground/5 data-[disabled]:opacity-50 ${action.danger ? "text-danger" : ""}`}
                      onSelect={() => select(action)}
                    >
                      {action.icon}
                      <span className="flex flex-col">
                        {action.label}
                        {action.disabled && action.disabledReason && (
                          <span className="text-xs text-muted">{action.disabledReason}</span>
                        )}
                      </span>
                    </ContextMenu.Item>
                  </div>
                );
              })}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        )}
      </ContextMenu.Root>
      <Sheet open={isTouch && isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] rounded-t-lg"
          onCloseAutoFocus={restoreFocus}
        >
          <SheetHeader>
            <SheetTitle>Actions for {label}</SheetTitle>
            <SheetDescription>Select an action for this row.</SheetDescription>
          </SheetHeader>
          <div className="thin-scrollbar overflow-y-auto p-3">
            {actions.map((action, index) => (
              <div key={`${action.group ?? ""}-${action.label}`}>
                {action.group && (index === 0 || actions[index - 1].group !== action.group) && (
                  <div className="px-2 pt-3 pb-1 text-xs font-medium text-muted">
                    {action.group}
                  </div>
                )}
                <button
                  type="button"
                  disabled={action.disabled}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left text-sm disabled:opacity-50 ${action.danger ? "text-danger" : "text-foreground"}`}
                  onClick={() => select(action)}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
                {action.disabled && action.disabledReason && (
                  <div className="px-2 pb-2 text-xs text-muted">{action.disabledReason}</div>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
