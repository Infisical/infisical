export const TABLE_ROW_ACTION_BAR_VISIBILITY_CLASS_NAME =
  "pointer-events-auto opacity-100 transition-all duration-300 motion-reduce:transition-none [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:pointer-events-auto [@media(hover:hover)]:group-focus-within:opacity-100";

export const TABLE_ROW_ACTION_BAR_CLASS_NAME = `${TABLE_ROW_ACTION_BAR_VISIBILITY_CLASS_NAME} gap-1 [@media(hover:hover)]:gap-0 [@media(hover:hover)]:group-hover:gap-1 [@media(hover:hover)]:group-focus-within:gap-1`;

export const TABLE_ROW_ACTION_BUTTON_CLASS_NAME =
  "overflow-hidden border-0 transition-all duration-300 motion-reduce:transition-none [@media(hover:hover)]:w-0 [@media(hover:hover)]:group-hover:w-7 [@media(hover:hover)]:group-focus-within:w-7";

export const TABLE_ROW_ACTION_BAR_FORCE_VISIBLE_CLASS_NAME =
  "pointer-events-auto opacity-100 [@media(hover:hover)]:pointer-events-auto [@media(hover:hover)]:opacity-100";

export const TABLE_ROW_ACTION_BAR_VISIBLE_CLASS_NAME = `${TABLE_ROW_ACTION_BAR_FORCE_VISIBLE_CLASS_NAME} gap-1 [@media(hover:hover)]:gap-1`;

export const TABLE_ROW_ACTION_BUTTON_VISIBLE_CLASS_NAME = "w-7 [@media(hover:hover)]:w-7";

export const TABLE_ROW_RESOURCE_ICON_CLASS_NAME =
  "hidden [@media(hover:hover)]:block [@media(hover:hover)]:group-hover:hidden [@media(hover:hover)]:group-focus-within:hidden";

export const TABLE_ROW_EXPAND_ICON_TRANSITION_CLASS_NAME =
  "transition-transform duration-200 ease-in-out motion-reduce:transition-none";

export const TABLE_ROW_EXPAND_ICON_CLASS_NAME = `block ${TABLE_ROW_EXPAND_ICON_TRANSITION_CLASS_NAME} [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block [@media(hover:hover)]:group-focus-within:block`;

export const TABLE_ROW_EXPANDED_ICON_CLASS_NAME = `block rotate-90 ${TABLE_ROW_EXPAND_ICON_TRANSITION_CLASS_NAME}`;

export const TABLE_ROW_ACTIVE_FILTER_CLASS_NAME =
  "[&>td>*]:!filter-none [&>td>[data-table-row-filter-contents]>*]:!filter-none [&>td>[data-table-row-filter-contents]>[data-table-row-filter-positioner]>*]:!filter-none";

export const TABLE_ROW_NAME_COLUMN_CLASS_NAME =
  "w-[var(--name-column-width,180px)] min-w-[180px] max-w-[var(--name-column-width,180px)]";

export const TABLE_ROW_NAME_HEADER_COLUMN_CLASS_NAME = `${TABLE_ROW_NAME_COLUMN_CLASS_NAME} pl-1`;

export const TABLE_ROW_NAME_CELL_COLUMN_CLASS_NAME = TABLE_ROW_NAME_HEADER_COLUMN_CLASS_NAME;

export const TABLE_BODY_ROW_FILTER_CLASS_NAME =
  "[&>tr>td>*:not([data-table-row-filter-contents])]:transition-[filter] [&>tr>td>*:not([data-table-row-filter-contents])]:duration-200 motion-reduce:[&>tr>td>*:not([data-table-row-filter-contents])]:transition-none [&>tr>td>[data-table-row-filter-contents]>*:not([data-table-row-filter-positioner])]:transition-[filter] [&>tr>td>[data-table-row-filter-contents]>*:not([data-table-row-filter-positioner])]:duration-200 motion-reduce:[&>tr>td>[data-table-row-filter-contents]>*:not([data-table-row-filter-positioner])]:transition-none [&>tr>td>[data-table-row-filter-contents]>[data-table-row-filter-positioner]>*]:transition-[filter] [&>tr>td>[data-table-row-filter-contents]>[data-table-row-filter-positioner]>*]:duration-200 motion-reduce:[&>tr>td>[data-table-row-filter-contents]>[data-table-row-filter-positioner]>*]:transition-none [@media(hover:hover)]:[&>tr:hover>td>[data-table-row-filter-contents]>[data-table-row-filter-positioner]>*]:!filter-none";

export const TABLE_BODY_ROW_FILTER_DIMMED_CLASS_NAME =
  "[&>tr>td>*:not([data-table-row-filter-contents])]:filter-[opacity(40%)] [&>tr>td>[data-table-row-filter-contents]>*:not([data-table-row-filter-positioner])]:filter-[opacity(40%)] [&>tr>td>[data-table-row-filter-contents]>[data-table-row-filter-positioner]>*]:filter-[opacity(40%)]";

export const TABLE_CELL_ACTION_BAR_VISIBILITY_CLASS_NAME =
  "pointer-events-auto opacity-100 transition-all duration-300 motion-reduce:transition-none [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/cell:pointer-events-auto [@media(hover:hover)]:group-hover/cell:opacity-100 [@media(hover:hover)]:group-focus-within/cell:pointer-events-auto [@media(hover:hover)]:group-focus-within/cell:opacity-100";

export const TABLE_CELL_ACTION_BAR_CLASS_NAME = `${TABLE_CELL_ACTION_BAR_VISIBILITY_CLASS_NAME} gap-1 [@media(hover:hover)]:gap-0 [@media(hover:hover)]:group-hover/cell:gap-1 [@media(hover:hover)]:group-focus-within/cell:gap-1`;

export const TABLE_CELL_ACTION_BUTTON_CLASS_NAME =
  "overflow-hidden border-0 transition-all duration-300 motion-reduce:transition-none [@media(hover:hover)]:w-0 [@media(hover:hover)]:group-hover/cell:w-7 [@media(hover:hover)]:group-focus-within/cell:w-7";
