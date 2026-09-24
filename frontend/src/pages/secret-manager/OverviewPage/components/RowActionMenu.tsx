import { useEffect, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  GitBranchIcon,
  MessageSquareIcon,
  Settings2Icon,
  WorkflowIcon
} from "lucide-react";

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
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

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
    setSelectedGroup(null);
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

  const directActions = actions.filter(
    (action) =>
      !action.danger &&
      (actions.length <= 3 ||
        !action.group ||
        action.group === "Value" ||
        action.label === "Copy Secret Name" ||
        action.label === "Copied Secret Name")
  );
  const dangerActions = actions.filter((action) => action.danger);
  const groupedActions = actions.filter(
    (action) => !directActions.includes(action) && !action.danger
  );
  const groups = Array.from(new Set(groupedActions.map((action) => action.group ?? "Manage")));
  const groupIcon = (group: string) => {
    if (group === "Annotate") return <MessageSquareIcon className="size-4" />;
    if (group === "Insights") return <WorkflowIcon className="size-4" />;
    if (group === "Environments") return <GitBranchIcon className="size-4" />;
    return <Settings2Icon className="size-4" />;
  };
  const renderDesktopAction = (action: RowAction) => (
    <ContextMenu.Item
      key={action.label}
      disabled={action.disabled}
      className={`relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-0 focus:bg-foreground/5 data-[disabled]:opacity-50 ${action.danger ? "text-danger" : ""}`}
      onSelect={() => select(action)}
    >
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
        {action.icon}
      </span>
      <span className="flex flex-col">
        {action.label}
        {action.disabled && action.disabledReason && (
          <span className="text-xs text-muted">{action.disabledReason}</span>
        )}
      </span>
    </ContextMenu.Item>
  );
  const renderTouchAction = (action: RowAction) => (
    <div key={action.label}>
      <button
        type="button"
        disabled={action.disabled}
        className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left text-sm disabled:opacity-50 ${action.danger ? "text-danger" : "text-foreground"}`}
        onClick={() => select(action)}
      >
        <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
          {action.icon}
        </span>
        <span>{action.label}</span>
      </button>
      {action.disabled && action.disabledReason && (
        <div className="px-2 pb-2 text-xs text-muted">{action.disabledReason}</div>
      )}
    </div>
  );

  return (
    <>
      <ContextMenu.Root onOpenChange={setIsOpen}>
        <ContextMenu.Trigger asChild>
          <IconButton
            ref={triggerRef}
            data-row-action-trigger=""
            aria-label={`More actions for ${label}`}
            variant="ghost"
            size="row"
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
              onClick={(event) => event.stopPropagation()}
              className="z-[var(--z-index-dropdown)] min-w-48 rounded-popover border border-border bg-popover p-1 text-sm text-foreground shadow-md"
              onCloseAutoFocus={(event) => {
                onCloseAutoFocus?.(event);
                if (!event.defaultPrevented) restoreFocus(event);
              }}
            >
              {directActions.map(renderDesktopAction)}
              {groups.length > 0 && directActions.length > 0 && (
                <ContextMenu.Separator className="my-1 h-px bg-border" />
              )}
              {groups.map((group) => (
                <ContextMenu.Sub key={group}>
                  <ContextMenu.SubTrigger className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-0 focus:bg-foreground/5 data-[state=open]:bg-foreground/5">
                    {groupIcon(group)}
                    <span className="grow">{group}</span>
                    <ChevronRightIcon className="size-4 text-muted" />
                  </ContextMenu.SubTrigger>
                  <ContextMenu.Portal>
                    <ContextMenu.SubContent
                      collisionPadding={8}
                      onClick={(event) => event.stopPropagation()}
                      className="z-[var(--z-index-dropdown)] min-w-48 rounded-popover border border-border bg-popover p-1 text-foreground shadow-md"
                    >
                      {groupedActions
                        .filter((action) => (action.group ?? "Manage") === group)
                        .map(renderDesktopAction)}
                    </ContextMenu.SubContent>
                  </ContextMenu.Portal>
                </ContextMenu.Sub>
              ))}
              {dangerActions.length > 0 && (
                <ContextMenu.Separator className="my-1 h-px bg-border" />
              )}
              {dangerActions.map(renderDesktopAction)}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        )}
      </ContextMenu.Root>
      <Sheet
        open={isTouch && isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setSelectedGroup(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] rounded-t-lg"
          onClick={(event) => event.stopPropagation()}
          onCloseAutoFocus={restoreFocus}
        >
          <SheetHeader className="pr-12">
            {selectedGroup && (
              <button
                type="button"
                className="mb-2 flex items-center gap-2 self-start text-sm text-muted"
                onClick={() => setSelectedGroup(null)}
              >
                <ArrowLeftIcon className="size-4" /> Back to Actions
              </button>
            )}
            <SheetTitle>{selectedGroup ?? `Actions for ${label}`}</SheetTitle>
            <SheetDescription>
              {selectedGroup ? `Actions for ${label}` : "Select an action for this row."}
            </SheetDescription>
          </SheetHeader>
          <div className="thin-scrollbar overflow-y-auto p-2">
            {selectedGroup ? (
              groupedActions
                .filter((action) => (action.group ?? "Manage") === selectedGroup)
                .map(renderTouchAction)
            ) : (
              <>
                {directActions.map(renderTouchAction)}
                {groups.length > 0 && directActions.length > 0 && (
                  <div className="my-1 h-px bg-border" />
                )}
                {groups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left text-sm text-foreground"
                    onClick={() => setSelectedGroup(group)}
                  >
                    {groupIcon(group)}
                    <span className="grow">{group}</span>
                    <ChevronRightIcon className="size-4 text-muted" />
                  </button>
                ))}
                {dangerActions.length > 0 && <div className="my-1 h-px bg-border" />}
                {dangerActions.map(renderTouchAction)}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
