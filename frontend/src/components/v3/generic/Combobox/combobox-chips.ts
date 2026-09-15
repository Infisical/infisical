/**
 * The chips-field shell, shared by `Combobox`'s multiple mode and `TagsInput`. Both are built from the same
 * Base UI parts, so the two drift apart the moment these strings live in two files. Per-consumer layout, the
 * container padding, stays at the call site.
 */

export const COMBOBOX_CHIPS_CLASS = [
  "flex min-h-9 w-full gap-1 rounded-md border border-border bg-transparent text-sm text-foreground transition-[color,box-shadow] outline-none",
  "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-foreground/20",
  "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[invalid=true]:border-danger data-[invalid=true]:ring-danger/40"
].join(" ");

/** Scrolls sideways when the chips stay on one line, and wraps to a capped height otherwise. */
export const comboboxChipsViewportClass = (singleLine?: boolean) =>
  [
    "scroll-edge-fade flex thin-scrollbar min-w-0 flex-1 items-center gap-1",
    singleLine ? "overflow-x-auto" : "max-h-24 flex-wrap overflow-y-auto"
  ].join(" ");

export const COMBOBOX_CHIP_CLASS =
  "flex h-6 max-w-full items-center gap-1 rounded-sm bg-foreground/10 px-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring";

export const COMBOBOX_CHIP_LABEL_CLASS = "max-w-48 truncate";

export const COMBOBOX_CHIP_REMOVE_CLASS =
  "flex size-4 shrink-0 items-center justify-center rounded-xs text-muted outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export const COMBOBOX_CHIPS_INPUT_CLASS =
  "h-6 min-w-24 flex-1 bg-transparent px-0.5 text-sm text-foreground outline-none placeholder:text-muted";
