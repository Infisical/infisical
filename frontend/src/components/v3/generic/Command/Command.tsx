import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";

import { cn } from "../../utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../Dialog";

const CommandInputFocusContext = React.createContext(false);

function Command({
  className,
  filter = (value: string, search: string, keywords?: string[]) => {
    const searchLower = search.toLowerCase();
    if (value.toLowerCase().includes(searchLower)) return 1;
    if (keywords?.some((k) => k.toLowerCase().includes(searchLower))) return 1;
    return 0;
  },
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      filter={filter}
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-foreground outline-0",
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  contentProps,
  loop = false,
  shouldFilter,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  contentProps?: Omit<React.ComponentProps<typeof DialogContent>, "children" | "className">;
  loop?: boolean;
  shouldFilter?: boolean;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        {...contentProps}
        className={cn("top-[12%] origin-top translate-y-0 overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command
          label={title}
          loop={loop}
          shouldFilter={shouldFilter}
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12"
        >
          <CommandInputFocusContext.Provider value>{children}</CommandInputFocusContext.Provider>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  disableFocusRing,
  startAdornment,
  endAdornment,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  disableFocusRing?: boolean;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
}) {
  const dialogDisablesFocusRing = React.useContext(CommandInputFocusContext);
  const showFocusRing = !(disableFocusRing ?? dialogDisablesFocusRing);

  return (
    <div
      data-slot="command-input-wrapper"
      className={cn(
        "flex h-9 items-center gap-2 border-b border-border px-3",
        showFocusRing &&
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:ring-inset"
      )}
    >
      {startAdornment ?? <SearchIcon aria-hidden="true" className="size-4 shrink-0 opacity-50" />}
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      {endAdornment}
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] thin-scrollbar scroll-py-1 overflow-x-hidden overflow-y-auto outline-0",
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="flex min-h-12 items-center justify-center py-2.5 text-center text-sm text-accent"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted",
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "[&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-pointer items-center gap-2 rounded-sm",
        "p-2 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-foreground/5",
        "data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "hover:bg-foreground/5",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto text-xs tracking-widest text-accent", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
};
