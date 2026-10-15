import type * as React from 'react';

/** Names in the Infisical line icon set (24px grid, 1.7 stroke). */
export type IconName =
  | 'search' | 'key' | 'plus' | 'minus' | 'check' | 'x' | 'chev-down' | 'chev-right' | 'chev-left' | 'chev-ud' | 'more' | 'copy' | 'eye'
  | 'history' | 'trash' | 'lock' | 'info' | 'alert' | 'alert-c' | 'check-c' | 'agent' | 'machine' | 'cert' | 'terminal' | 'user' | 'external'
  | 'sync' | 'upload' | 'clock' | 'folder' | 'link' | 'settings' | 'bell' | 'globe' | 'inbox' | 'home' | 'arrow-down' | 'arrow-up' | 'git' | 'calendar'
  | 'file' | 'folder-open' | 'download' | 'sidebar' | 'user-plus' | 'megaphone' | 'apps' | 'building' | 'sun' | 'moon' | 'monitor';

export type Tone = 'info' | 'ok' | 'warn' | 'bad';

/* ------------------------------------------------------------ Icon, Kbd, Spinner, Loader */
export interface IconProps { name: IconName; size?: number; strokeWidth?: number; label?: string; className?: string; style?: React.CSSProperties }
/** A line icon in currentColor. Hidden from screen readers unless `label` is set. */
export declare function Icon(props: IconProps): React.ReactElement;
/** A shortcut string or key list: "⌘K", "mod+K", "Ctrl+Shift+P", "G then S", ['mod', 'K'], [['G'], ['S']]. */
export type KeyCombo = string | string[] | string[][];
export interface KbdProps {
  /** The shortcut. Modifier symbols get their own caps; `mod` is ⌘ on Apple platforms and Ctrl elsewhere; "then" makes a sequence. A string child works too. */
  keys?: KeyCombo;
  children?: React.ReactNode;
  /** `md` 20px caps (default) for text and docs; `sm` 18px inside controls and menus. Tooltips draw 16px caps on ink. */
  size?: 'sm' | 'md';
  /** Which platform's keys to show. Default `auto`. */
  platform?: 'auto' | 'mac' | 'other';
  title?: string;
  className?: string;
}
/** A keyboard shortcut as flat key caps. Screen readers hear the key names ("Command K"). DropdownMenu, Tooltip and Input use it for their hints. */
export declare function Kbd(props: KbdProps): React.ReactElement;
export interface SpinnerProps {
  /** `inline` 16 x 8 (default): two pixels trading size, in currentColor. `base` 47 x 23 and `page` 159 x 79: the mark in pixels, in `mark`; `page` assembles first. */
  size?: 'inline' | 'base' | 'page';
  /** Pass when it stands alone, so it announces as a status. */
  label?: string;
  className?: string;
}
/** The Infisical infinity while something works. Toasts, rows and link buttons use `inline`; cards and views use it through Loader. */
export declare function Spinner(props: SpinnerProps): React.ReactElement;
export interface LoaderProps {
  /** `inline` beside the label in a row of text, `base` (default) centered in a card or panel, `page` for a whole view. Buttons use `loading` instead. */
  size?: 'inline' | 'base' | 'page';
  /** What is loading, as a present participle: "Loading secrets". Beside the Spinner inline, under it otherwise. */
  label?: string;
  /** Page only: one muted line under the label. */
  description?: React.ReactNode;
  /** Milliseconds to wait before showing, so fast loads never flash. Use about 300 for base and page. */
  delay?: number;
  className?: string;
}
/** A status that wraps a Spinner with its label. */
export declare function Loader(props: LoaderProps): React.ReactElement;

/* ------------------------------------------------------------ Actions */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Default `secondary`. One `primary` per view. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'destructive' | 'danger-ghost' | 'link';
  /** sm 32px, md 36px (default), lg 40px. */
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  /** Square button; requires aria-label. */
  iconOnly?: boolean;
  /** Sets aria-busy and sweeps a halftone band: above the content with a difference blend on filled buttons, as a mask over the content on ghost ones. Link buttons show the inline Spinner. */
  loading?: boolean;
  full?: boolean;
  /** Pressed toggle state (aria-pressed). */
  selected?: boolean;
  /** Renders an anchor instead of a button. */
  href?: string;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;

export interface ButtonGroupProps { variant?: 'attached' | 'spaced' | 'toolbar'; label?: string; className?: string; children?: React.ReactNode }
export declare function ButtonGroup(props: ButtonGroupProps): React.ReactElement;

export interface ToggleOption { value: string; label: React.ReactNode; count?: React.ReactNode }
export interface ToggleGroupProps { options: ToggleOption[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; label?: string; orientation?: 'horizontal' | 'vertical'; className?: string }
/** @deprecated Use Tabs with `variant="segmented"`. Renders one, with `options` as its `tabs`. */
export declare function ToggleGroup(props: ToggleGroupProps): React.ReactElement;

export type MenuItem =
  | { type?: 'item'; label: React.ReactNode; icon?: IconName; /** Rendered as a small Kbd. */ shortcut?: KeyCombo; meta?: React.ReactNode; danger?: boolean; disabled?: boolean; submenu?: boolean; onSelect?: (item: MenuItem) => void }
  | { type: 'checkbox' | 'radio'; label: React.ReactNode; checked?: boolean; disabled?: boolean; onSelect?: (item: MenuItem) => void }
  | { type: 'label'; label: React.ReactNode }
  | { type: 'separator' };
export interface DropdownMenuProps {
  /** A Button element; receives aria-haspopup, aria-expanded and the click handler. */
  trigger: React.ReactElement;
  items: MenuItem[];
  label?: string;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  width?: number;
  /** Float the menu into document.body beside its trigger. Default: only when an ancestor would clip it, such as a table's scroll box. `false` keeps it in place. */
  portal?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}
export declare function DropdownMenu(props: DropdownMenuProps): React.ReactElement;

/* ------------------------------------------------------------ Forms */
export interface FieldProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Replaces the description and marks the control invalid. */
  error?: React.ReactNode;
  optional?: boolean;
  /** Label a group of Checkboxes or Switches. */
  group?: boolean;
  orientation?: 'vertical' | 'horizontal';
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}
export declare function Field(props: FieldProps): React.ReactElement;

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: 'sm' | 'md' | 'lg';
  mono?: boolean;
  icon?: IconName;
  invalid?: boolean;
  /** A shortcut hint on the right, rendered as a small Kbd ("/"). */
  kbd?: KeyCombo;
  /** Nested items after the hint (clear or copy icon buttons). Each takes a size-nested slot (28px in a 36px field), grouped 4px apart at the field's end. */
  trailing?: React.ReactNode;
  multiline?: boolean;
}
export declare const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;

export interface SecretInputProps { value: string; size?: 'sm' | 'md' | 'lg'; maskLength?: number; defaultRevealed?: boolean; copyable?: boolean; onCopy?: (value: string) => void; invalid?: boolean; id?: string; 'aria-label'?: string; className?: string }
/** A masked value with Reveal and Copy. */
export declare function SecretInput(props: SecretInputProps): React.ReactElement;

export interface CopyButtonProps {
  value: string;
  /** Accessible name before copying. Default "Copy value"; it reads "Copied" for 1.2s after, and a status announces it. */
  label?: string;
  /** Wrap the button in a Tooltip that repeats its label. Not inside fields, which clip. */
  tooltip?: boolean;
  onCopy?: (value: string) => void;
  className?: string;
}
export declare function CopyButton(props: CopyButtonProps): React.ReactElement;

export interface InputGroupProps extends InputProps {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  copyValue?: string;
  /** A Button element joined to the right edge. */
  action?: React.ReactElement;
}
export declare const InputGroup: React.ForwardRefExoticComponent<InputGroupProps & React.RefAttributes<HTMLInputElement>>;

export interface SelectOption { value: string; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean; group?: string }
export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Stacked label inside a 40px (lg) trigger. */
  label?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  invalid?: boolean;
  align?: 'start' | 'end';
  menuWidth?: number;
  defaultOpen?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Select(props: SelectProps): React.ReactElement;

export interface ComboboxOption { value: string; label: string; meta?: React.ReactNode }
export interface ComboboxProps {
  options: ComboboxOption[];
  multiple?: boolean;
  value?: string | string[] | null;
  defaultValue?: string | string[] | null;
  onChange?: (value: any) => void;
  onCreate?: (query: string) => void;
  placeholder?: string;
  emptyText?: string;
  mono?: boolean;
  icon?: IconName;
  invalid?: boolean;
  disabled?: boolean;
  defaultOpen?: boolean;
  defaultQuery?: string;
  id?: string;
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Combobox(props: ComboboxProps): React.ReactElement;

export interface MultiSelectOption { value: string; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean; group?: string }
export interface MultiSelectProps {
  options: MultiSelectOption[];
  /** Default true. With false, one value (or null) and the list closes on a pick. */
  multiple?: boolean;
  value?: string[] | string | null;
  defaultValue?: string[] | string | null;
  onChange?: (value: any) => void;
  /** Shown in the default trigger when nothing is picked. */
  placeholder?: string;
  /** Shown in the default trigger when every enabled option is on ("All environments"). */
  allLabel?: React.ReactNode;
  /** Your own content for the default trigger. Values keep the options' order. */
  renderValue?: (values: string[], options: MultiSelectOption[]) => React.ReactNode;
  /** Your own trigger, such as a toolbar Button. It receives aria-haspopup, aria-expanded and the click handler. */
  trigger?: React.ReactElement;
  /** Select all and Deselect all in the bar above the options. Default true when several can be picked. */
  quickActions?: boolean;
  /** Single mode: a bar with Clear. */
  clearable?: boolean;
  /** Stacked label inside a 40px trigger. */
  label?: string;
  size?: 'sm' | 'md';
  mono?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  menuWidth?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string;
  'aria-label'?: string;
  /** Accessible name of the listbox, when it differs from the trigger's. */
  listLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** Several values (or one) from a known list, without typing. A button trigger, a listbox with checks, and quick Select all and Deselect all. */
export declare function MultiSelect(props: MultiSelectProps): React.ReactElement;

export interface CheckboxProps { checked?: boolean; defaultChecked?: boolean; indeterminate?: boolean; onChange?: (checked: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean; id?: string; 'aria-label'?: string; className?: string }
export declare const Checkbox: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLButtonElement>>;

export interface SwitchProps { checked?: boolean; defaultChecked?: boolean; onChange?: (checked: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; layout?: 'inline' | 'row'; size?: 'sm' | 'md'; disabled?: boolean; id?: string; 'aria-label'?: string; className?: string }
export declare const Switch: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLButtonElement>>;

/* ------------------------------------------------------------ Data display */
export interface BadgeProps { tone?: 'outline' | 'soft' | 'solid' | 'accent' | Tone; size?: 'sm' | 'md'; dot?: boolean; mono?: boolean; className?: string; children?: React.ReactNode }
export declare function Badge(props: BadgeProps): React.ReactElement;
export declare function Count(props: { tone?: 'accent' | 'ink'; children?: React.ReactNode; 'aria-label'?: string; className?: string }): React.ReactElement;

export interface AvatarProps { kind?: 'person' | 'org' | 'machine' | 'agent' | 'fallback' | 'more'; name?: string; initials?: string; label?: string; size?: number; status?: 'ok' | 'warn' | 'off'; ring?: boolean; className?: string }
export declare function Avatar(props: AvatarProps): React.ReactElement;
export declare function AvatarGroup(props: { max?: number; size?: number; label?: string; className?: string; children?: React.ReactNode }): React.ReactElement;
/** An Item with an Avatar as its lead: the name as the title, one line under it. */
/** An Item with an Avatar lead: a name and one line under it. `media` replaces the Avatar and `title` the name as the first line (the Sidebar's account button: the organization's avatar beside your name). */
export declare function Identity(props: { name?: string; title?: React.ReactNode; media?: React.ReactNode; description?: React.ReactNode; kind?: AvatarProps['kind']; initials?: string; size?: number; status?: AvatarProps['status']; mono?: boolean; className?: string }): React.ReactElement;

export interface CardProps {
  variant?: 'framed' | 'plain';
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  media?: React.ReactNode;
  footer?: React.ReactNode;
  flush?: boolean;
  className?: string;
  children?: React.ReactNode;
}
/** Overflow works like Table's: nothing squeezes past its floor or clips. The framed eyebrow truncates and its action keeps its width. A plain card's header is an Item: its `action` (a badge) ends the title line and the title wraps beside it, the description runs on under it, and narrower than the media plus `size-text-min` the heading drops under the media. Footer buttons wrap onto a second line. Truncated text shows in full on hover. */
export declare function Card(props: CardProps): React.ReactElement;
/** An Item inside a bordered button. Names take two lines, then an ellipsis; descriptions one. Lay tiles out in an `ifs-tiles` grid, which drops a column instead of squeezing a tile under `size-tile-min` (208px; `--tile-min` overrides it). */
export declare function Tile(props: { title: React.ReactNode; description?: React.ReactNode; media?: React.ReactNode; selected?: boolean; disabled?: boolean; onClick?: () => void; className?: string }): React.ReactElement;
/** A square tile for an icon or initials. `tone` tints it for status that travels with its icon. Icons draw at 18px, 14px in tiles of 28px and under. */
export declare function Media(props: { icon?: IconName; size?: number; tone?: 'ok' | 'warn' | 'bad' | 'info'; children?: React.ReactNode; className?: string }): React.ReactElement;
/** `stat` (default): big values right of wrapping terms; a value never shrinks, up to 60% of the row, then truncates. `meta`: label and value pairs in a plain card, labels up to 45% and wrapping, values truncating. `props`: bordered rows for sheets; labels keep their width and long values wrap. Truncated values show in full on hover. */
export declare function DataList(props: { items: Array<[React.ReactNode, React.ReactNode]>; variant?: 'stat' | 'meta' | 'props'; className?: string }): React.ReactElement;

export interface ItemProps {
  /** The lead: a Media tile for this icon (40px, 24px at sm), tinted by `tone`. Or pass `media`. */
  icon?: IconName;
  tone?: 'ok' | 'warn' | 'bad' | 'info';
  media?: React.ReactNode;
  title: React.ReactNode;
  /** Right after the title: a small Badge. */
  badge?: React.ReactNode;
  /** Ends the title line: a time (a string renders mono muted), a count, a status badge. The title truncates before it. */
  meta?: React.ReactNode;
  description?: React.ReactNode;
  /** A bad line with an icon under the description: what failed on this object and what to do. */
  error?: React.ReactNode;
  /** Small buttons, primary on the right. They drop under the text when both cannot share a line. */
  actions?: React.ReactNode;
  /** `end` (default): actions beside the text, under it when both cannot share a line. `below`: actions always in their own row under the text, left aligned with it, so the meta ends every row's first line and the actions keep one place at every width. Inside a List, the list's value. Ignored at `sm`. */
  actionsPlacement?: 'end' | 'below';
  /** The title at 600 behind an accent-fg mark; screen readers hear "Unread". */
  unread?: boolean;
  /** `md` (default) or `sm`: one line around 24px media, no description. Inside a List, the list's size. */
  size?: 'md' | 'sm';
  /** `false` lets the title and description wrap instead of truncating. */
  truncate?: boolean;
  /** Inside a List: the row is a link. The title stretches over the row; badge, meta and actions stay clickable. */
  href?: string;
  target?: string;
  rel?: string;
  /** Inside a List: the row is a button (or, with `href`, a handler on the link). */
  onClick?: (event: React.MouseEvent) => void;
  /** The row whose details are open: the select ground, text one step up, aria-current. */
  current?: boolean;
  /** The aria-current value: `page` for links, `true` for buttons by default. */
  currentType?: 'page' | 'step' | 'location' | 'true';
  /** The row's id in a List with `selection="multiple"`. */
  value?: string | number;
  /** `false`: the row still opens but stays out of the selection. */
  selectable?: boolean;
  /** Faint, not clickable, out of the selection. */
  disabled?: boolean;
  /** Stays in place on row-done with a muted title. */
  resolved?: boolean;
  /** Outside a List, the root element. */
  as?: 'div' | 'span' | 'li';
  className?: string;
  /** A body under the text (a Progress bar, a snippet). At sm, the badge. */
  children?: React.ReactNode;
  /** Earlier names: `trail` is `meta`, `selected` is `current`, `variant="compact"` is `size="sm"`. */
  trail?: React.ReactNode;
  selected?: boolean;
  variant?: 'default' | 'compact';
}
/** The layout of one object: a lead, text whose first line holds the title, a badge and the meta, then the actions. Item owns spacing, alignment and overflow and never draws a box: the text keeps `size-text-min` (160px); lead, badge, meta and buttons keep their width; the title truncates before the meta; actions drop under the text, left aligned with it, when both cannot share a line. Truncated text shows in full on hover. Inside a List it becomes a row and takes the list's behavior. */
export declare function Item(props: ItemProps): React.ReactElement;
export interface ListProps {
  /** `framed` (default): the tint shell around an inset surface. `plain`: a bordered surface. `bare`: no box. */
  variant?: 'framed' | 'plain' | 'bare';
  /** `md` (default) or `sm` (40px one-line rows). Items take it. */
  size?: 'md' | 'sm';
  /** Where every row's actions go: `end` (default) or `below`, their own row under the text. Use `below` for rows whose buttons change with state (queues, requests), including Undo, Revoke and Retry. An Item's own `actionsPlacement` wins. */
  actionsPlacement?: 'end' | 'below';
  /** Framed only: an eyebrow inside the shell, and a link or count at its end. */
  title?: React.ReactNode;
  action?: React.ReactNode;
  /** The list's accessible name when there is no title. */
  label?: string;
  /** `multiple`: a checkbox leads each Item with a `value`; with a title, the header gets select all. */
  selection?: 'none' | 'multiple';
  selectedIds?: Array<string | number>;
  defaultSelectedIds?: Array<string | number>;
  onSelectionChange?: (ids: Array<string | number>) => void;
  /** Skeleton rows after any rows already there. */
  loading?: boolean;
  loadingRows?: number;
  /** Shown when there are no rows: a compact EmptyState. */
  empty?: React.ReactNode;
  /** A row under the rest: "View all", load more. */
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}
/** Gives Items their behavior, the way Table does for its rows: the box, the row size, link or button rows with one current row, multiple selection, disabled and resolved rows, sections, loading, empty and a footer. Arrow keys, Home and End move between row targets; Tab reaches every row's actions. */
export declare function List(props: ListProps): React.ReactElement;
/** A labeled group of rows inside a List: an eyebrow, an optional count, its Items. */
export declare function ListSection(props: { label: React.ReactNode; meta?: React.ReactNode; className?: string; children?: React.ReactNode }): React.ReactElement;
/** The earlier name for List. `variant="compact"` is a plain list of sm rows. */
export declare function ItemGroup(props: Omit<ListProps, 'variant'> & { variant?: 'framed' | 'compact' | 'plain' | 'bare' }): React.ReactElement;

export interface TableColumn<Row> {
  key: string;
  header: React.ReactNode;
  /** A fixed track: `120` or `'120px'`. Leave it out and the column fits its widest cell, header included. */
  width?: number | string;
  /** The column's floor in px. Default `size-cell-min` (64px); every column without a `width` gets it. */
  minWidth?: number;
  /** The column's ceiling in px. Longer text truncates with an ellipsis and shows in full on hover. Badges and avatars keep their size. */
  maxWidth?: number;
  /** Take the table's spare width. Default: the first column without a `width`. Pass `false` there to leave spare width empty. */
  grow?: boolean;
  align?: 'start' | 'center' | 'end';
  render?: (row: Row, index: number) => React.ReactNode;
  /** Mono, ink, truncates like any text. */
  primary?: boolean;
  sortable?: boolean;
  /** Keeps the header for screen readers only. */
  hideHeader?: boolean;
  /** An actions column: icon buttons or a DropdownMenu trigger (sm, 32px). It fits them with no 64px floor, aligns them to the end 4px apart, keeps its header for screen readers only (default "Actions"), and pins to the right edge while the table scrolls sideways. Put it last. */
  actions?: boolean;
  /** Last column only: stick to the right edge while the table scrolls sideways, with a rule where content passes under it. Default true for an `actions` column. */
  pin?: boolean;
}
export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowId?: (row: Row) => string;
  label?: string;
  /** `basic` (default): rules between rows. `striped`: every other row on `row-done`, no rules. `bordered`: rules between rows and columns. */
  variant?: 'basic' | 'striped' | 'bordered';
  selectable?: boolean;
  selectedIds?: string[];
  defaultSelectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  rowLabel?: (row: Row) => string;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSortChange?: (sort: { key: string; dir: 'asc' | 'desc' }) => void;
  /** A fixed viewport height in px. The header sticks, the body scrolls, and the bottom fades while rows sit below it. Change it to grow the view (a load more that shows more at once): it eases to the new height over 200ms. */
  height?: number;
  /** With `height`: render only the rows in view (plus a few), for thousands of rows. Give columns a `width` or `maxWidth` so tracks hold still as rows mount. */
  virtual?: boolean;
  /** Row height in px. Default 48. Virtual rows are exactly this tall. */
  rowHeight?: number;
  /** With `height`: fades the end of the viewport and floats a button over it that loads the next batch. Leave it out once everything is loaded. */
  loadMore?: { label?: React.ReactNode; onClick: () => void; loading?: boolean; icon?: IconName };
  empty?: React.ReactNode;
  className?: string;
}
/** Rows of objects in columns that fit their content. Scrolls sideways instead of squeezing, and scrolls, virtualizes and loads more inside a fixed `height`. */
export declare function Table<Row = any>(props: TableProps<Row>): React.ReactElement;
export declare function EnvMark(props: { present: boolean; env?: string }): React.ReactElement;

export interface DataGridColumn<Row> {
  /** The column in the row objects. */
  key: string;
  /** Header text. Default `key`. */
  name?: string;
  /** The Postgres type, shown beside the name: `uuid`, `text`, `int4`, `numeric`, `bool`, `timestamptz`, `jsonb`. Numbers align right; edits must parse as the type. */
  type?: string;
  /** A key icon in the header; not editable unless `editable` says so. */
  primaryKey?: boolean;
  /** Delete and Backspace set NULL, and an empty edit of a non-text column saves NULL. */
  nullable?: boolean;
  /** Default: true when the grid is `editable`, false for primary keys. */
  editable?: boolean;
  /** Starting width in px. Leave it out and the column fits its content. People can drag the header edge; a double-click fits it again. */
  width?: number;
  /** Floor in px. Default `size-cell-min` (64px). */
  minWidth?: number;
  /** Ceiling in px for a column that fits its content. Longer values truncate with an ellipsis and show in full on hover. */
  maxWidth?: number;
  /** Default: `end` for number types, else `start`. */
  align?: 'start' | 'end';
  /** Display text; return null to show NULL. Default: booleans as true or false, objects as JSON. */
  format?: (value: unknown, row: Row) => string | null;
  /** Turn edited text into a value, or refuse it with an error. Default: parses by `type`. */
  parse?: (text: string, row: Row) => { value: unknown } | { error: string };
  render?: (value: unknown, row: Row) => React.ReactNode;
  /** Default true when the grid has `onSortChange`. */
  sortable?: boolean;
}
export interface DataGridChange<Row> { rowId: string; rowIndex: number; row: Row; key: string; value: unknown; previous: unknown }
export interface DataGridSelection { rows: [number, number]; columns: [number, number]; active: { row: number; column: number } }
export interface DataGridProps<Row> {
  columns: DataGridColumn<Row>[];
  rows: Row[];
  getRowId?: (row: Row) => string;
  /** The grid's accessible name, usually the table: `public.secret_versions`. */
  label?: string;
  /** Double-click, Enter, F2 or typing edits the active cell; Delete clears the range; paste fills from the active cell. */
  editable?: boolean;
  /** Every edit, clear and paste, as one list. Keep the edits and pass them back as `dirty` until they are saved. */
  onCellsChange?: (changes: DataGridChange<Row>[]) => void;
  /** Unsaved edits by row id, then column key. Those cells sit on `warn-wash`. */
  dirty?: Record<string, Record<string, unknown>>;
  /** A fixed viewport height in px. Rows render virtually, so thousands stay fast. */
  height?: number;
  /** Row height in px. Default 32. */
  rowHeight?: number;
  /** The first row's number in the gutter, for paged results. Default 1. */
  rowNumberStart?: number;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSortChange?: (sort: { key: string; dir: 'asc' | 'desc' }) => void;
  onSelectionChange?: (selection: DataGridSelection | null) => void;
  /** A dragged width in px, or null after a double-click fits the column again. */
  onColumnResize?: (key: string, width: number | null) => void;
  /** After Cmd or Ctrl+C copies the range as tab-separated text. */
  onCopy?: (text: string, cells: number) => void;
  /** A status bar under the grid in mono-sm: row counts, timing, the selection. */
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
}
/** A Postgres-style spreadsheet: typed columns, row numbers, cell and range selection, keyboard, inline edits, NULL, copy and paste, resizable columns, virtual rows. */
export declare function DataGrid<Row = any>(props: DataGridProps<Row>): React.ReactElement;

export declare function Separator(props: { orientation?: 'horizontal' | 'vertical'; soft?: boolean; label?: string; align?: 'start' | 'center'; className?: string }): React.ReactElement;

/* ------------------------------------------------------------ Navigation */
export interface TabItem { value: string; label: React.ReactNode; count?: React.ReactNode; content?: React.ReactNode }
export interface TabsProps {
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** `underline` (default) for sections of one object. `segmented` for peer views of the same data, filters with counts included (it replaced ToggleGroup). */
  variant?: 'underline' | 'segmented';
  /** `horizontal` (default), or `vertical` with the list left of the panel. Arrow keys follow it: left and right, or up and down. */
  orientation?: 'horizontal' | 'vertical';
  label?: string;
  className?: string;
}
/** One indicator per tablist, the segmented thumb or the underline bar, slides and resizes to the current tab. Every tab keeps its selected width, so nothing shifts. A list that runs out of room scrolls with no scrollbar, fading the edges that hide tabs and keeping the current tab clear of the fade. */
export declare function Tabs(props: TabsProps): React.ReactElement;

export interface Crumb {
  label: React.ReactNode;
  href?: string;
  onClick?: React.MouseEventHandler;
  mono?: boolean;
  /** A lead before the label: an Avatar (kind="org") or Media at 20px. Product crumbs use it for the organization and project. */
  media?: React.ReactNode;
  /** Makes the crumb a Switcher: the label and a chevron open the list of its siblings. Takes every SwitcherProps but `trigger`. */
  menu?: Omit<SwitcherProps, 'trigger'>;
}
/** `default`: text2 ancestors and the current page in ink. `eyebrow`: the uppercase muted form above a page title. `product`: the levels of the product in a top bar, as 32px targets that hover, with media and switchers; labels truncate before they wrap. */
export declare function Breadcrumb(props: { items: Crumb[]; separator?: 'slash' | 'chevron'; maxItems?: number; variant?: 'default' | 'eyebrow' | 'product'; /** Default true: the last crumb is the current page. false when the page's title follows it, as in PageHeader. */ current?: boolean; label?: string; className?: string }): React.ReactElement;

export interface PaginationProps {
  variant?: 'numbered' | 'compact' | 'more';
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  pageCount?: number;
  total?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  label?: string;
  className?: string;
}
export declare function Pagination(props: PaginationProps): React.ReactElement;

export interface TreeNode {
  id: string;
  name: string;
  /** Folders have children (an empty array included), unless `type` says otherwise. */
  children?: TreeNode[];
  type?: 'folder' | 'file';
  /** Replaces folder, folder-open or file. Use `key` for secret files such as .env. */
  icon?: IconName;
  /** Muted mono text on the right ("12 keys"), or a small Badge. */
  meta?: React.ReactNode;
  disabled?: boolean;
  /** Accessible name when the row needs more than its name ("shared, read only"). */
  label?: string;
}
export interface FileTreeProps {
  items: TreeNode[];
  expanded?: string[];
  defaultExpanded?: string[];
  onExpandedChange?: (ids: string[]) => void;
  selected?: string | null;
  defaultSelected?: string | null;
  onSelect?: (id: string, node: TreeNode) => void;
  /** Which rows can be picked. Default `all`. Folders that cannot be picked open and close instead. */
  selectable?: 'all' | 'files' | 'folders' | 'none';
  /** Hide files, for a folder picker. */
  foldersOnly?: boolean;
  /** `md` 32px rows (default), `sm` 28px for popovers. */
  size?: 'sm' | 'md';
  /** Scroll past this height; the edge with more rows fades over 32px. */
  maxHeight?: number | string;
  /** `middle` (default) keeps the end of long names; `end` uses an ellipsis. */
  truncate?: 'middle' | 'end';
  label?: string;
  empty?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
/** Folders and files as an ARIA tree with roving focus, arrow-key navigation and type-ahead. Folders open with AnimatedCollapse; names middle-truncate. */
export declare function FileTree(props: FileTreeProps): React.ReactElement;

/* ------------------------------------------------------------ Overlays */
export interface TooltipProps { content: React.ReactNode; /** Rendered as a Kbd on ink. */ shortcut?: KeyCombo; /** Top and bottom float into the body and flip when their side has no room. */ side?: 'top' | 'bottom' | 'left' | 'right'; wrap?: boolean; delay?: number; defaultOpen?: boolean; children: React.ReactElement }
export declare function Tooltip(props: TooltipProps): React.ReactElement;

export interface PopoverProps {
  trigger: React.ReactElement;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode | ((api: { close: () => void }) => React.ReactNode);
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  width?: number;
  className?: string;
}
export declare function Popover(props: PopoverProps): React.ReactElement;

interface ModalBase { open: boolean; onOpenChange?: (open: boolean) => void; className?: string; /** Render in place instead of a portal on document.body. */ portal?: boolean }
export interface DialogProps extends ModalBase { title: React.ReactNode; description?: React.ReactNode; footer?: React.ReactNode; width?: number; dismissible?: boolean; children?: React.ReactNode }
export declare function Dialog(props: DialogProps): React.ReactElement | null;
export interface AlertDialogProps extends ModalBase { title: React.ReactNode; description: React.ReactNode; confirmLabel?: string; cancelLabel?: string; onConfirm?: () => void; confirmText?: string; tone?: 'destructive' | 'neutral'; icon?: IconName }
export declare function AlertDialog(props: AlertDialogProps): React.ReactElement | null;
export interface SheetProps extends ModalBase { title: React.ReactNode; eyebrow?: React.ReactNode; monoTitle?: boolean; meta?: React.ReactNode; actions?: React.ReactNode; footer?: React.ReactNode; width?: number; children?: React.ReactNode }
export declare function Sheet(props: SheetProps): React.ReactElement | null;

/* ------------------------------------------------------------ Feedback */
export interface AlertProps { tone?: Tone; title?: React.ReactNode; icon?: IconName; actions?: React.ReactNode; onDismiss?: () => void; role?: string; className?: string; children?: React.ReactNode }
export declare function Alert(props: AlertProps): React.ReactElement;
export declare function Banner(props: { icon?: IconName; action?: React.ReactNode; onDismiss?: () => void; className?: string; children?: React.ReactNode }): React.ReactElement;

export interface ToastProps { title: React.ReactNode; description?: React.ReactNode; tone?: 'neutral' | 'ok' | 'bad'; loading?: boolean; icon?: IconName; action?: { label: string; onClick: () => void }; onDismiss?: () => void; duration?: number; className?: string }
export declare function Toast(props: ToastProps): React.ReactElement;
export declare function ToastStack(props: { inline?: boolean; label?: string; className?: string; children?: React.ReactNode }): React.ReactElement;

export interface ProgressProps { value?: number; max?: number; label?: React.ReactNode; valueLabel?: React.ReactNode; tone?: 'ink' | 'warn' | 'bad' | 'auto'; warnAt?: number; 'aria-label'?: string; className?: string }
export declare function Progress(props: ProgressProps): React.ReactElement;
export declare function ProgressSteps(props: { steps: string[]; current: number; label?: React.ReactNode; className?: string }): React.ReactElement;

export declare function Skeleton(props: { width?: number | string; height?: number | string; lines?: number; className?: string; style?: React.CSSProperties }): React.ReactElement;
export declare function EmptyState(props: { title: React.ReactNode; description?: React.ReactNode; icon?: IconName; actions?: React.ReactNode; variant?: 'default' | 'compact'; className?: string }): React.ReactElement;

/* ------------------------------------------------------------ Code */
export type CodeLanguage = 'bash' | 'sh' | 'shell' | 'terminal' | 'env' | 'dotenv' | 'json' | 'yaml' | 'yml' | 'js' | 'ts' | 'jsx' | 'tsx' | 'python' | 'py' | 'hcl' | 'terraform' | 'text';
export interface CodeProps {
  /** Render the bare block view instead of an inline chip. */
  block?: boolean;
  /** The text. `children` works too. */
  code?: string;
  children?: React.ReactNode;
  language?: CodeLanguage | string;
  /** Block: numbered lines (a CSS counter, never copied). */
  lineNumbers?: boolean;
  /** Block: 1-based lines on accent-wash. */
  highlight?: number[];
  /** Block: break long lines at spaces, continuation lines hanging 2ch in. */
  wrap?: boolean;
  /** Block: scroll past this many lines. */
  maxLines?: number;
  maxHeight?: number | string;
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** Machine text. Inline, a mono chip in a sentence; with `block`, the bare code view with neutral highlighting that CodeBlock frames. */
export declare function Code(props: CodeProps): React.ReactElement;

export interface CodeBlockProps extends Omit<CodeProps, 'block' | 'children'> {
  /** A mono label on the left: a file name, a language or "Terminal". Strings middle-truncate. Defaults to the language. */
  label?: React.ReactNode;
  icon?: IconName;
  /** Extra header actions before Copy: ghost small Buttons, sized to 28px. */
  actions?: React.ReactNode;
  /** Default true. */
  copy?: boolean;
  /** What Copy copies, when it differs from the code (or the Json child's pretty-printed, redacted value). */
  copyValue?: string;
  copyLabel?: string;
  onCopy?: (value: string) => void;
  /** A custom body such as a Json element, instead of `code`. */
  children?: React.ReactNode;
}
/** Code in the framed container, with a header: label left, actions right, Copy always last. */
export declare function CodeBlock(props: CodeBlockProps): React.ReactElement;

export interface JsonProps {
  /** Any JSON value, or a JSON string. */
  value: unknown;
  /** Levels open at first. Default 2. */
  defaultExpandDepth?: number;
  /** Keys whose values never show: masked on screen, "<redacted>" when a CodeBlock copies. */
  redact?: string[] | ((key: string) => boolean);
  wrap?: boolean;
  maxLines?: number;
  maxHeight?: number | string;
  label?: string;
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** A JSON value as a tree whose objects and arrays open and close, with the neutral code highlighting and redaction. */
export declare function Json(props: JsonProps): React.ReactElement;

export interface SnippetProps {
  value: string;
  /** A muted marker before the value, such as "$". Never copied. */
  prompt?: string;
  size?: 'sm' | 'md';
  copyable?: boolean;
  copyLabel?: string;
  onCopy?: (value: string) => void;
  invalid?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** One line to copy: a read-only mono field with a Copy button. Secret values use SecretInput instead. */
export declare const Snippet: React.ForwardRefExoticComponent<SnippetProps & React.RefAttributes<HTMLInputElement>>;

/* ------------------------------------------------------------ Utilities */
export interface MiddleTruncateProps {
  /** The text. A string child works too. */
  text?: string;
  children?: string;
  /** The fewest characters kept after the ellipsis, such as a file extension. Default: a balanced cut. */
  keepEnd?: number;
  mono?: boolean;
  /** Set false to drop the hover title. */
  title?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
/** One line that drops characters from the middle to fit, refitting on resize and font load. Full text in the title, for screen readers and on copy. */
export declare function MiddleTruncate(props: MiddleTruncateProps): React.ReactElement;

export interface AnimatedCollapseProps {
  open: boolean;
  /** Mount the children on first open, then keep them. */
  lazy?: boolean;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  onTransitionEnd?: React.TransitionEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
}
/** Shows and hides its children by animating height over 200ms on the slide curve. Never animates on first paint; closed content leaves the tab order; reduced motion jumps. */
export declare function AnimatedCollapse(props: AnimatedCollapseProps): React.ReactElement;

/* ------------------------------------------------------------ Composites */
export interface CommandItem {
  id?: string;
  /** A string label is matched and its matched part marked. */
  label: React.ReactNode;
  /** What to match when `label` is not a string. */
  searchText?: string;
  icon?: IconName;
  /** A 20px lead instead of an icon: an Avatar, a Media tile, an EnvMark. */
  media?: React.ReactNode;
  /** Muted text after the label on the same line. */
  description?: React.ReactNode;
  /** Quiet text at the end: a type ("Secret"), a path, a time. */
  meta?: React.ReactNode;
  metaMono?: boolean;
  /** A Kbd at the end, for commands the app binds. */
  shortcut?: KeyCombo;
  /** More words that find this item ("rotate" for "Rotate now"). */
  keywords?: string[];
  mono?: boolean;
  /** Navigates on Enter or click, in a new tab with mod. Ignored when there is an onSelect. */
  href?: string;
  onSelect?: (item: CommandItem, how: { newTab: boolean }) => void;
  /** Opens this page of the menu instead of acting ("Switch organization"). */
  page?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Stay open after selecting. */
  keepOpen?: boolean;
}
export interface CommandGroup {
  id?: string;
  /** An eyebrow over the group. */
  label?: React.ReactNode;
  /** Quiet text at the label's end ("412"). */
  meta?: React.ReactNode;
  items: CommandItem[];
  /** While searching, show at most this many. */
  limit?: number;
  /** Only show while searching (secrets, members). */
  searchOnly?: boolean;
}
export interface CommandPage { title: React.ReactNode; placeholder?: string; groups: CommandGroup[]; loading?: boolean; loadingLabel?: string; filter?: boolean | ((item: CommandItem, query: string) => boolean); emptyText?: React.ReactNode; emptyHint?: React.ReactNode }
export interface CommandMenuProps {
  groups: CommandGroup[];
  /** Pages an item can open with `page`. Backspace on an empty search, Escape or the back button returns. */
  pages?: Record<string, CommandPage>;
  /** Shown first while the search is empty, under "Recent". */
  recent?: CommandItem[];
  recentLabel?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The shortcut that opens and closes it from anywhere. Default "mod+k"; false for none. */
  hotkey?: string | false;
  placeholder?: string;
  /** Every change of the search, with the open page's id: run your own search here and pass the results in `groups`. */
  onQueryChange?: (query: string, page: string | null) => void;
  /** The inline spinner in the search row; with no results yet, a "Searching" row. */
  loading?: boolean;
  loadingLabel?: string;
  /** Default: match every word against labels, descriptions and keywords, labels first. `false` shows results as given. */
  filter?: boolean | ((item: CommandItem, query: string) => boolean);
  /** With no results: "No results for “q”." and this hint under it. */
  emptyHint?: React.ReactNode;
  emptyText?: React.ReactNode;
  /** Called for every item chosen, after its own onSelect. */
  onSelect?: (item: CommandItem, how: { newTab: boolean }) => void;
  /** Quiet text at the footer's end ("Searching acme-platform"); false hides the footer. */
  footer?: React.ReactNode | false;
  /** Default 600. */
  width?: number;
  /** The results' scroll height. Default 360. */
  maxHeight?: number;
  /** Render the panel in place, not as a dialog. */
  inline?: boolean;
  defaultQuery?: string;
  defaultPage?: string;
  label?: string;
  listLabel?: string;
  portal?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
/** Global navigation and search, opened with mod+K: a search row, grouped results that filter as you type, pages for drilling in, and key hints. */
export declare function CommandMenu(props: CommandMenuProps): React.ReactElement | null;
export interface SearchTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Default "Search". It is also the button's accessible name. */
  label?: string;
  /** Default "mod+K"; false for none. */
  shortcut?: KeyCombo | false;
  /** The 32px icon-only form. */
  compact?: boolean;
}
/** A button that looks like a search field and opens the CommandMenu. */
export declare function SearchTrigger(props: SearchTriggerProps): React.ReactElement;

export interface SwitcherOption { value: string; label: React.ReactNode; searchText?: string; description?: string; media?: React.ReactNode; meta?: React.ReactNode; metaMono?: boolean; mono?: boolean; group?: string; disabled?: boolean; keywords?: string[] }
export interface SwitcherAction { label: React.ReactNode; icon?: IconName; shortcut?: KeyCombo; danger?: boolean; disabled?: boolean; onSelect?: (action: SwitcherAction) => void }
/** Groups the actions: a rule, or a muted label over the next ones. */
export type SwitcherActionDivider = { type: 'separator' } | { type: 'label'; label: React.ReactNode };
export interface SwitcherProps {
  /** A button element; it gets aria-haspopup, aria-expanded and the handlers. */
  trigger: React.ReactElement;
  options: SwitcherOption[];
  /** The one you are in; it is checked. */
  value?: string;
  onChange?: (value: string, option: SwitcherOption) => void;
  /** After a rule, under the options: "Create project", "View all projects". Separator and label entries group them. */
  actions?: Array<SwitcherAction | SwitcherActionDivider>;
  /** A block above everything, on a rule. */
  header?: React.ReactNode;
  /** Controls under the list, on a rule, reached with Tab (the theme picker and you, in the Sidebar's account popover). A function gets `close`. */
  footer?: React.ReactNode | ((api: { close: () => void }) => React.ReactNode);
  /** Default: when there are more than seven options. */
  searchable?: boolean;
  placeholder?: string;
  emptyText?: string;
  /** The listbox's name ("Switch project"). */
  label?: string;
  /** Default 280. */
  width?: number;
  maxHeight?: number;
  align?: 'start' | 'end';
  /** `right` opens beside the trigger; with `align="end"` their bottom edges line up. */
  side?: 'bottom' | 'top' | 'right';
  /** Default: float into the body only when something would clip it. */
  portal?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}
/** Switch the organization, project or environment you are in: a listbox popover with search, leads, a check on the current one and actions. */
export declare function Switcher(props: SwitcherProps): React.ReactElement;

export interface NavItem {
  id: string;
  label: React.ReactNode;
  /** 18px, in the label's color. */
  icon?: IconName;
  href?: string;
  onClick?: (event: React.MouseEvent) => void;
  /** An accent Count at the row's end; in the rail, a dot in accent-fg (ink in light, the accent in dark). */
  count?: React.ReactNode;
  /** A small Badge at the row's end ("New"). */
  badge?: React.ReactNode;
  /** Opens in a new tab, with an external icon. */
  external?: boolean;
  /** One level of pages under this row. The row opens and closes them; in the rail they open in a flyout. */
  children?: NavItem[];
  defaultOpen?: boolean;
  disabled?: boolean;
  /** Shown in the rail's tooltip. */
  shortcut?: KeyCombo;
}
export interface NavSection { id?: string; label?: React.ReactNode; items: NavItem[] }
/** One space of the Sidebar: Home (the products) or Organization. */
export interface NavSpace { id: string; label: string; /** In the rail's switch. */ icon?: IconName; sections: NavSection[] }
export interface SidebarProps {
  /** The nav, or use `spaces`. */
  sections?: NavSection[];
  /** One space's sections at a time, picked with a segmented switch under the tools. The space holding `current` shows by default and follows it. */
  spaces?: NavSpace[];
  space?: string;
  defaultSpace?: string;
  onSpaceChange?: (space: string) => void;
  /** The switch's accessible name. Default "Navigation". */
  spacesLabel?: string;
  /** The id of the page you are on: its row takes sidebar-current (neutral), and its group opens. */
  current?: string;
  onNavigate?: (item: NavItem, event: React.MouseEvent) => void;
  /** The organization, in the account button at the bottom: its avatar and name there, its options and actions in the popover.
   *  `optionsLabel` names the options ("Organizations"); `media` replaces the avatar in the button. */
  org?: { name: string; plan?: string; optionsLabel?: string; media?: React.ReactNode } & Omit<SwitcherProps, 'trigger' | 'header'>;
  /** Your own node above the tools row. */
  header?: React.ReactNode;
  /** A search icon button in the tools row (its tooltip shows the shortcut, mod+K by default), or your own element; false for none. */
  search?: { onClick: () => void; label?: string; shortcut?: KeyCombo | false } | React.ReactElement | false;
  /** An invite icon button beside search ("Invite members", the user-plus icon), or your own element; false for none. */
  invite?: { onClick: () => void; label?: string; dialog?: boolean } | React.ReactElement | false;
  /** Rows above the account: "What's new", "Docs". */
  footerItems?: NavItem[];
  /** You, in the account button (your name over the organization's) and at the foot of its popover. With `href` or `onClick` that foot row opens
   *  your settings (`settingsLabel`, default "Personal settings"). Your items follow the organization's actions. */
  user?: { name: string; email?: string; initials?: string; items?: MenuItem[]; href?: string; onClick?: (event: React.MouseEvent) => void; settingsLabel?: string };
  /** A Light, Dark and System picker in a row of the account popover. */
  theme?: { value: 'light' | 'dark' | 'system'; onChange: (value: 'light' | 'dark' | 'system') => void; label?: string };
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Default true: the toggle at the start of the tools row, at the same spot in the rail. */
  collapsible?: boolean;
  /** Default true: the 1px sidebar-line on the right edge. false when the inset beside it draws its own border (a framed inset). */
  edge?: boolean;
  /** The nav's accessible name. Default "Main". */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** The app's navigation column: collapse, search and invite at the top, a Home / Organization switch with `spaces`, sections of nav rows with counts and one level of children, footer rows, and one account button for you and the organization. The current page is neutral; counts are accent. Every padding and gap in it is 8px. Collapses to a 53px rail. */
export declare function Sidebar(props: SidebarProps): React.ReactElement;
/** The app tile: the ink mark at 20 by 10 on a 28px accent square. */
export declare function AppTile(props: { size?: number; label?: string; className?: string }): React.ReactElement;

export interface TopBarProps {
  /** Crumbs for a product Breadcrumb (switchers in `menu`), or your own element. */
  breadcrumb?: Crumb[] | React.ReactNode;
  /** On the right: a SearchTrigger, icon buttons, an Avatar menu. */
  actions?: React.ReactNode;
  /** The breadcrumb's accessible name. Default "Location". */
  label?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
/** The strip across the top of the inset: the product breadcrumb on the left, page-wide tools on the right. */
export declare function TopBar(props: TopBarProps): React.ReactElement;

export interface PageHeaderProps {
  title: React.ReactNode;
  /** Crumbs (the eyebrow form by default), or your own Breadcrumb. */
  breadcrumb?: Crumb[] | React.ReactNode;
  breadcrumbVariant?: 'default' | 'eyebrow';
  separator?: 'slash' | 'chevron';
  maxItems?: number;
  breadcrumbLabel?: string;
  /** Mono for keys, paths and hosts. */
  mono?: boolean;
  /** Small badges beside the title: environment, status, version. */
  badges?: React.ReactNode;
  /** A 40px lead before the title: an Avatar or Media. */
  media?: React.ReactNode;
  /** The lede under the title, in muted. */
  description?: React.ReactNode;
  /** Buttons on the right, primary last. They drop under the text when both cannot share a line. */
  actions?: React.ReactNode;
  /** Underline Tabs for the page's sections. */
  tabs?: React.ReactNode;
  /** `lg` (default): display, 44/44, for top-level pages. `md`: 28/32, for one object's page. */
  size?: 'lg' | 'md';
  /** The title's element. Default h1. */
  as?: 'h1' | 'h2';
  className?: string;
  style?: React.CSSProperties;
}
/** The top of a page: breadcrumb, title with badges, lede, actions and tabs. */
export declare function PageHeader(props: PageHeaderProps): React.ReactElement;

export interface SettingsCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Beside the title: a badge ("Admins"), a docs link. */
  action?: React.ReactNode;
  /** The fields: Fields, `Switch layout="row"`, horizontal Fields, a Snippet. */
  children?: React.ReactNode;
  /** Whether anything differs from what is saved. Save is disabled until it does; Discard shows while it does. */
  dirty?: boolean;
  /** Save, from the button or Enter in a field. Return a promise to show Saving, then Saved; reject with an Error to show its message. */
  onSave?: () => void | boolean | Promise<unknown>;
  onDiscard?: () => void;
  /** The footer's status while nothing changed: what the setting affects, a limit. */
  hint?: React.ReactNode;
  /** An error to show in the footer, from your own checks. */
  error?: React.ReactNode;
  /** Control the busy state yourself. */
  saving?: boolean;
  /** Read-only: fields look read-only, no buttons, and the footer says why (true says a generic line). */
  locked?: boolean | React.ReactNode;
  /** Skeleton fields while the setting loads. */
  loading?: boolean;
  /** `danger`: bad-line border and a bad-wash footer, for destructive settings with your own `actions`. */
  tone?: 'default' | 'danger';
  /** Replaces Discard and Save. */
  actions?: React.ReactNode;
  saveLabel?: string;
  discardLabel?: string;
  savingText?: string;
  savedText?: string;
  dirtyText?: string;
  /** Default 3. */
  headingLevel?: 2 | 3 | 4;
  /** false: no footer. */
  footer?: false;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** A setting, or a few that save together: title and description, fields, and a paper footer with its status and Save. */
export declare function SettingsCard(props: SettingsCardProps): React.ReactElement;

export interface BulkAction { id?: string; label: string; icon?: IconName; onClick?: () => void; danger?: boolean; disabled?: boolean; loading?: boolean; shortcut?: KeyCombo }
export interface FloatingActionBarProps {
  /** How many are selected. The bar shows while it is above 0. */
  count: number;
  /** How many there are in all: with onSelectAll, "Select all 412" shows while fewer are picked. */
  total?: number;
  onSelectAll?: () => void;
  onClear?: () => void;
  /** In order of importance, danger last. Those that do not fit move from the end into More. */
  actions: BulkAction[];
  /** Always in More. */
  moreActions?: BulkAction[];
  /** Default "selected": "3 selected". */
  selectedLabel?: string;
  selectAllLabel?: string;
  clearLabel?: string;
  /** `fixed` (default): the viewport's bottom. `contained`: the bottom of the nearest positioned ancestor. */
  placement?: 'fixed' | 'contained';
  /** Space kept on each side, in px. Default 16. */
  gutter?: number;
  /** The toolbar's name. Default "Bulk actions". */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** Bulk actions for a selection, floating over the bottom of the view: the count, select all, actions that overflow into More, and Clear. */
export declare function FloatingActionBar(props: FloatingActionBarProps): React.ReactElement | null;

export interface StepDef {
  id?: string;
  /** Short, for the step indicator: "Source", "Map", "Review". */
  title: React.ReactNode;
  /** The page variant's heading, when it should say more than the title. */
  heading?: React.ReactNode;
  description?: React.ReactNode;
  /** The page variant's step list: one short line under the title, such as what was picked ("github-deployer"). */
  summary?: React.ReactNode;
  content?: React.ReactNode | ((api: { next: () => void; back: () => void; goTo: (i: number) => void; index: number; isLast: boolean; busy: boolean }) => React.ReactNode);
  /** Runs on Continue. true (or nothing) moves on; false stays (show your field errors); a string stays and shows in the footer. May return a promise. */
  validate?: () => boolean | string | void | Promise<boolean | string | void>;
  /** The dialog's width on this step. */
  width?: number;
  /** Continue's label on this step. */
  nextLabel?: string;
  optional?: boolean;
  disabled?: boolean;
  /** Marks the step in the indicator. */
  error?: boolean;
}
export interface StepsProps {
  steps: Array<Pick<StepDef, 'id' | 'title' | 'description' | 'optional' | 'disabled' | 'error'>>;
  current: number;
  /** The furthest step reached; steps up to it can be clicked. Default: current. */
  reached?: number;
  /** Which steps are done. Default: every step before current. */
  completed?: number[];
  onStepClick?: (index: number) => void;
  /** `horizontal` (default): segments with labels. `vertical`: a numbered list with descriptions. */
  orientation?: 'horizontal' | 'vertical';
  hideLabels?: boolean;
  label?: string;
  className?: string;
}
/** Where a flow is: segments with labels, or a numbered list. Steps already reached are buttons. */
export declare function Steps(props: StepsProps): React.ReactElement;
export interface MultiStepProps {
  variant: 'sheet' | 'page' | 'dialog';
  steps: StepDef[];
  /** The flow's name: the sheet or dialog title. */
  title?: React.ReactNode;
  /** Sheet only: an eyebrow over the title. */
  eyebrow?: React.ReactNode;
  step?: number;
  defaultStep?: number;
  onStepChange?: (index: number) => void;
  /** After the last step validates. Return a promise to keep the primary busy; reject with an Error to show its message. */
  onComplete?: () => void | Promise<unknown>;
  /** Cancel on the first step (the page variant shows it only when you pass this). */
  onCancel?: () => void;
  /** Sheet and dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Dialog only: the element it grows out of and shrinks back into. Clicking it opens the dialog. */
  trigger?: React.ReactElement;
  /** Sheet: default 440. Dialog: default 480, or a step's own `width`. */
  width?: number;
  /** Default "Done". Name the object: "Create identity", "Import 14 secrets". */
  completeLabel?: string;
  nextLabel?: string;
  backLabel?: string;
  cancelLabel?: string;
  /** Default true: a closed sheet or dialog starts over at the first step. */
  resetOnClose?: boolean;
  portal?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
/** A task in steps, in a sheet, in the page, or in a dialog that grows from its trigger and resizes to each step. Steps validate before moving on and slide in the direction of travel. */
export declare function MultiStep(props: MultiStepProps): React.ReactElement;

export interface Announcement {
  id?: string;
  /** Muted, uppercase: the area and the date ("Secrets · Sep 24"). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The media area: a composition of real components (a Kbd, an Item, a Snippet), never an illustration. */
  media?: React.ReactNode;
  /** A link or link button under the text: "Read the docs", "Try it". */
  action?: { label: React.ReactNode; href?: string; external?: boolean; onClick?: () => void };
}
export interface AnnouncementsProps {
  items: Announcement[];
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Called with each card's id when it shows. */
  onSeen?: (id: string, item: Announcement) => void;
  /** After Done on the last card. */
  onDone?: () => void;
  /** Default true: Left, Right and swipes wrap around. */
  loop?: boolean;
  /** Default 480. */
  width?: number;
  nextLabel?: string;
  backLabel?: string;
  doneLabel?: string;
  /** Default "What's new". */
  label?: string;
  resetOnClose?: boolean;
  portal?: boolean;
  className?: string;
}
/** What's new, as cards that cycle in a dialog: media, eyebrow, title, a line or two, an action; dots, Back and Next. */
export declare function Announcements(props: AnnouncementsProps): React.ReactElement | null;

declare global {
  interface Window {
    Infisical: {
      Icon: typeof Icon; Kbd: typeof Kbd; Spinner: typeof Spinner; Loader: typeof Loader; Button: typeof Button; ButtonGroup: typeof ButtonGroup; ToggleGroup: typeof ToggleGroup; DropdownMenu: typeof DropdownMenu;
      Field: typeof Field; Input: typeof Input; SecretInput: typeof SecretInput; InputGroup: typeof InputGroup; CopyButton: typeof CopyButton; Select: typeof Select; Combobox: typeof Combobox; MultiSelect: typeof MultiSelect;
      Checkbox: typeof Checkbox; Switch: typeof Switch; Badge: typeof Badge; Count: typeof Count; Avatar: typeof Avatar; AvatarGroup: typeof AvatarGroup; Identity: typeof Identity;
      Card: typeof Card; Tile: typeof Tile; Media: typeof Media; DataList: typeof DataList; ItemGroup: typeof ItemGroup; Item: typeof Item; List: typeof List; ListSection: typeof ListSection; Table: typeof Table; EnvMark: typeof EnvMark; DataGrid: typeof DataGrid;
      Separator: typeof Separator; Tabs: typeof Tabs; Breadcrumb: typeof Breadcrumb; Pagination: typeof Pagination; FileTree: typeof FileTree; Tooltip: typeof Tooltip; Popover: typeof Popover;
      Dialog: typeof Dialog; AlertDialog: typeof AlertDialog; Sheet: typeof Sheet; Alert: typeof Alert; Banner: typeof Banner; Toast: typeof Toast; ToastStack: typeof ToastStack;
      Progress: typeof Progress; ProgressSteps: typeof ProgressSteps; Skeleton: typeof Skeleton; EmptyState: typeof EmptyState;
      Code: typeof Code; CodeBlock: typeof CodeBlock; Json: typeof Json; Snippet: typeof Snippet; MiddleTruncate: typeof MiddleTruncate; AnimatedCollapse: typeof AnimatedCollapse; iconNames: IconName[];
      CommandMenu: typeof CommandMenu; SearchTrigger: typeof SearchTrigger; Switcher: typeof Switcher; Sidebar: typeof Sidebar; AppTile: typeof AppTile; TopBar: typeof TopBar; PageHeader: typeof PageHeader; SettingsCard: typeof SettingsCard; FloatingActionBar: typeof FloatingActionBar; MultiStep: typeof MultiStep; Steps: typeof Steps; Announcements: typeof Announcements;
    };
  }
}
