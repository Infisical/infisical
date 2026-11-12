import * as React from "react";
import { CircleHelp } from "lucide-react";

import { CipherLink, type CipherLinkTarget, useCipherLinkMatch } from "../lib/link";
import { ListHighlight } from "../lib/list-highlight";
import { useReportPresence } from "../lib/presence-count";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Count } from "./badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { Icon, type IconName } from "./icon";
import { Sheet, SheetContent, SheetTitle } from "./sheet";
import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { Tooltip, TooltipProvider } from "./tooltip";
import {
  type ShellMenuEntry,
  ShellBottomSheet,
  ShellMenuItems,
  type ShellSheetSlot,
  ShellSheetRows,
  useAppShell,
  useShellChrome
} from "./top-bar";

import styles from "./sidebar.module.css";

export interface SidebarLink {
  id: string;
  label: string;
  icon?: IconName;
  href?: string;
  onClick?: () => void;
  count?: number;
  external?: boolean;
  disabled?: boolean;
  drillIn?: boolean;
  link?: CipherLinkTarget;
  level?: string;
}
export interface SidebarItem extends SidebarLink {
  children?: readonly SidebarLink[];
  defaultOpen?: boolean;
}
export interface SidebarSection {
  label?: string;
  icon?: IconName;
  items: readonly SidebarItem[];
}
export interface SidebarSpace {
  id: string;
  label: string;
  icon: IconName;
  sections: readonly SidebarSection[];
}
export interface SidebarScope {
  id: string;
  back: SidebarLink;
  sections: readonly SidebarSection[];
}
export interface SidebarLevel {
  id: string;
  label: string;
  parent?: string;
  sections: readonly SidebarSection[];
}
export interface SidebarHelp {
  status?: { label: string; href: string; state?: "ok" | "warn" | "bad" };
  whatsNew?: { onSelect: () => void; unread?: number; latest?: string; label?: string };
  items?: readonly ShellMenuEntry[];
  version?: string;
  label?: string;
}
export interface SidebarAnnouncements {
  unread: number;
  onClick: () => void;
  label?: string;
}
export interface SidebarProps {
  sections?: readonly SidebarSection[];
  levels?: readonly SidebarLevel[];
  scope?: SidebarScope;
  spaces?: readonly SidebarSpace[];
  space?: string;
  defaultSpace?: string;
  onSpaceChange?: (space: string) => void;
  spacesLabel?: string;
  current?: string;
  onNavigate?: (item: SidebarLink) => void;
  help?: SidebarHelp;
  announcements?: SidebarAnnouncements;
  footerItems?: readonly SidebarItem[];
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  collapsible?: boolean;
  header?: React.ReactNode;
  edge?: boolean;
  label?: string;
  className?: string;
}

const total = (items: readonly SidebarLink[] = []) =>
  items.reduce((sum, item) => sum + (item.count ?? 0), 0);

const sectionsTotal = (sections: readonly SidebarSection[]) =>
  sections.reduce(
    (sum, section) =>
      sum + section.items.reduce((acc, item) => acc + (item.count ?? 0) + total(item.children), 0),
    0
  );

const holds = (sections: readonly SidebarSection[], id?: string) =>
  id !== undefined &&
  sections.some((section) =>
    section.items.some(
      (item) => item.id === id || item.children?.some((childItem) => childItem.id === id)
    )
  );

const LevelTrail = React.createContext<readonly string[]>([]);

const RowContent = ({
  item,
  count,
  child,
  trailing
}: {
  item: SidebarLink;
  count?: number;
  child?: boolean;
  trailing?: React.ReactNode;
}) => (
  <>
    {item.icon && !child && <Icon name={item.icon} size={18} className={styles.icon} />}
    <span className={styles.label}>{item.label}</span>
    {count ? (
      <>
        <Count className={styles.count}>{count}</Count>
        <span className={styles.dot} aria-hidden="true" />
      </>
    ) : null}
    {item.external && <Icon name="external" size={14} className={styles.trailing} />}
    {trailing}
  </>
);

const drill = <Icon name="chev-right" size={14} className={styles.trailing} />;

const SidebarRow = ({
  item,
  current,
  rail,
  child,
  back,
  onNavigate
}: {
  item: SidebarLink;
  current?: string;
  rail: boolean;
  child?: boolean;
  back?: boolean;
  onNavigate?: SidebarProps["onNavigate"];
}) => {
  const isCurrent = !back && item.id === current;
  const name = back ? `Back to ${item.label}` : item.label;
  const drillIn = !back && (item.drillIn || item.level !== undefined);
  const holdsCurrent = React.useContext(LevelTrail).includes(item.level ?? "") && !back;
  const shared = {
    className: cn(styles.row, back && styles.back),
    "data-sidebar-back": back || undefined,
    "data-sidebar-target": "",
    "data-current": isCurrent || undefined,
    "data-holds-current": (holdsCurrent && !isCurrent) || undefined,
    "data-child": child || undefined,
    "aria-current": isCurrent ? ("page" as const) : undefined,
    "aria-label": rail || back ? name : undefined,
    "aria-description": drillIn ? "Opens section" : undefined,
    onClick: (event: React.MouseEvent) => {
      if (item.disabled) {
        event.preventDefault();
        return;
      }
      item.onClick?.();
      onNavigate?.(item);
    }
  };
  const content = (
    <RowContent
      item={item}
      count={item.count}
      child={child}
      trailing={drillIn && !rail ? drill : undefined}
    />
  );
  const row =
    item.link && !item.disabled ? (
      <CipherLink link={item.link} {...shared}>
        {content}
      </CipherLink>
    ) : item.href || item.link ? (
      <a
        {...shared}
        href={item.disabled ? undefined : item.href}
        aria-disabled={item.disabled || undefined}
        target={item.external ? "_blank" : undefined}
        rel={item.external ? "noreferrer" : undefined}
      >
        {content}
      </a>
    ) : (
      <button {...shared} type="button" disabled={item.disabled}>
        {content}
      </button>
    );
  return rail ? (
    <Tooltip content={drillIn ? `${name}, opens section` : name} side="right">
      {row}
    </Tooltip>
  ) : (
    row
  );
};

const SidebarGroup = ({
  item,
  current,
  rail,
  onNavigate
}: {
  item: SidebarItem;
  current?: string;
  rail: boolean;
  onNavigate?: SidebarProps["onNavigate"];
}) => {
  const children = item.children ?? [];
  const holdsCurrent = children.some((childItem) => childItem.id === current);
  const [open, setOpen] = React.useState(item.defaultOpen ?? holdsCurrent);
  const listId = React.useId();
  React.useEffect(() => {
    if (holdsCurrent) setOpen(true);
  }, [holdsCurrent]);
  if (rail)
    return (
      <DropdownMenu>
        <Tooltip content={item.label} side="right">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={styles.row}
              data-sidebar-target=""
              data-holds-current={holdsCurrent || undefined}
              aria-label={item.label}
              disabled={item.disabled}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") event.preventDefault();
              }}
            >
              <RowContent item={item} count={total(children)} />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
          {children.map((childItem) => (
            <DropdownMenuItem
              key={childItem.id}
              disabled={childItem.disabled}
              data-current={childItem.id === current || undefined}
              aria-current={childItem.id === current ? "page" : undefined}
              className={childItem.id === current ? styles.flyoutCurrent : undefined}
              onSelect={() => {
                childItem.onClick?.();
                onNavigate?.(childItem);
              }}
              asChild={Boolean(childItem.href || childItem.link)}
            >
              {childItem.link ? (
                <CipherLink
                  link={childItem.link}
                  data-current={childItem.id === current || undefined}
                >
                  {childItem.label}
                  {childItem.count ? <Count>{childItem.count}</Count> : null}
                </CipherLink>
              ) : childItem.href ? (
                <a
                  href={childItem.href}
                  target={childItem.external ? "_blank" : undefined}
                  rel={childItem.external ? "noreferrer" : undefined}
                >
                  {childItem.label}
                  {childItem.count ? <Count>{childItem.count}</Count> : null}
                </a>
              ) : (
                <span>
                  {childItem.label}
                  {childItem.count ? <Count>{childItem.count}</Count> : null}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  return (
    <li>
      <button
        type="button"
        className={styles.row}
        data-sidebar-target=""
        data-holds-current={holdsCurrent || undefined}
        aria-expanded={open}
        aria-controls={listId}
        disabled={item.disabled}
        onClick={() => setOpen(!open)}
      >
        <RowContent
          item={item}
          count={open ? undefined : total(children)}
          trailing={<Icon name="chev-right" size={14} className={styles.chevron} />}
        />
      </button>
      <ul id={listId} className={styles.children} hidden={!open}>
        {children.map((childItem) => (
          <li key={childItem.id}>
            <SidebarRow
              item={childItem}
              current={current}
              rail={false}
              child
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </li>
  );
};

const SidebarItems = ({
  items,
  current,
  rail,
  onNavigate
}: {
  items: readonly SidebarItem[];
  current?: string;
  rail: boolean;
  onNavigate?: SidebarProps["onNavigate"];
}) => (
  <ul className={styles.rows}>
    {items.map((item) =>
      item.children?.length ? (
        rail ? (
          <li key={item.id}>
            <SidebarGroup item={item} current={current} rail onNavigate={onNavigate} />
          </li>
        ) : (
          <SidebarGroup
            key={item.id}
            item={item}
            current={current}
            rail={false}
            onNavigate={onNavigate}
          />
        )
      ) : (
        <li key={item.id}>
          <SidebarRow item={item} current={current} rail={rail} onNavigate={onNavigate} />
        </li>
      )
    )}
  </ul>
);

const moveFocus = (event: React.KeyboardEvent<HTMLElement>) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const targets = [
    ...event.currentTarget.querySelectorAll<HTMLElement>("[data-sidebar-target]")
  ].filter(
    (target) =>
      !target.closest("[hidden]") &&
      !target.hasAttribute("disabled") &&
      target.getAttribute("aria-disabled") !== "true"
  );
  const index = targets.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? targets.length - 1
        : Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), targets.length - 1);
  targets[next]?.focus();
};

const HelpMenu = ({ help, rail }: { help: SidebarHelp; rail: boolean }) => (
  <DropdownMenuContent side={rail ? "right" : "top"} align="end" className={styles.helpMenu}>
    {help.status && (
      <>
        <DropdownMenuItem asChild>
          <a href={help.status.href} target="_blank" rel="noreferrer">
            {[
              <span key="dot" className={styles.statusMark} aria-hidden="true">
                <span className={styles.statusDot} data-state={help.status.state ?? "ok"} />
              </span>,
              help.status.label,
              <Icon key="external" name="external" size={14} className={styles.menuEnd} />
            ]}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>
    )}
    {help.whatsNew && (
      <>
        <DropdownMenuItem onSelect={help.whatsNew.onSelect}>
          {[
            <Icon key="icon" name="megaphone" />,
            help.whatsNew.label ?? "What's new",
            help.whatsNew.unread ? (
              <Count key="count" className={styles.helpCount}>
                {help.whatsNew.unread}
              </Count>
            ) : (
              help.whatsNew.latest && (
                <span key="latest" className={styles.helpMeta}>
                  {help.whatsNew.latest}
                </span>
              )
            )
          ]}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>
    )}
    <ShellMenuItems entries={help.items ?? []} />
    {help.version && (
      <>
        <DropdownMenuSeparator />
        <div className={styles.version}>
          <Icon name="info" />
          <span>Version</span>
          <span className={styles.versionValue}>{help.version}</span>
        </div>
      </>
    )}
  </DropdownMenuContent>
);

const HelpSheet = ({
  help,
  open,
  onOpenChange
}: {
  help: SidebarHelp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const close = () => onOpenChange(false);
  const lead: ShellMenuEntry[] = [
    ...(help.status
      ? [
          { label: help.status.label, href: help.status.href, external: true },
          { type: "separator" } as const
        ]
      : []),
    ...(help.whatsNew
      ? [
          {
            label: help.whatsNew.unread
              ? `${help.whatsNew.label ?? "What's new"}, ${help.whatsNew.unread} unread`
              : (help.whatsNew.label ?? "What's new"),
            icon: "megaphone" as const,
            onSelect: help.whatsNew.onSelect
          },
          { type: "separator" } as const
        ]
      : [])
  ];
  return (
    <ShellBottomSheet title={help.label ?? "Help"} open={open} onOpenChange={onOpenChange}>
      <ShellSheetRows entries={[...lead, ...(help.items ?? [])]} onDone={close} />
      {help.version && (
        <div className={styles.sheetVersion}>
          <Icon name="info" size={18} />
          <span>Version</span>
          <span className={styles.versionValue}>{help.version}</span>
        </div>
      )}
    </ShellBottomSheet>
  );
};

const SidebarView = ({
  sections,
  levels,
  scope: scopeProp,
  spaces,
  space,
  defaultSpace,
  onSpaceChange,
  spacesLabel = "Navigation",
  current,
  onNavigate,
  help,
  announcements,
  footerItems,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  collapsible = true,
  header,
  edge = true,
  label,
  className
}: SidebarProps) => {
  const [isCollapsed, setCollapsed] = useControllableState({
    value: collapsed,
    defaultValue: defaultCollapsed,
    onChange: onCollapsedChange
  });
  const currentSpace = spaces?.find((entry) => holds(entry.sections, current))?.id;
  const [spaceId, setSpaceId] = useControllableState({
    value: space,
    defaultValue: defaultSpace ?? currentSpace ?? spaces?.[0]?.id ?? "",
    onChange: onSpaceChange
  });
  const lastCurrent = React.useRef(current);
  React.useEffect(() => {
    if (current === lastCurrent.current) return;
    lastCurrent.current = current;
    if (currentSpace) setSpaceId(currentSpace);
  }, [current, currentSpace, setSpaceId]);
  const activeSpace = spaces?.find((entry) => entry.id === spaceId) ?? spaces?.[0];
  const levelOf = (id?: string) => levels?.find((entry) => entry.id === id);
  const currentLevel =
    levels?.find((entry) => holds(entry.sections, current)) ??
    levels?.find((entry) => !entry.parent);
  const [levelId, setLevelId] = React.useState(currentLevel?.id);
  const lastLevelCurrent = React.useRef(current);
  React.useEffect(() => {
    if (current === lastLevelCurrent.current) return;
    lastLevelCurrent.current = current;
    setLevelId(currentLevel?.id);
  }, [current, currentLevel?.id]);
  const shownLevel = levelOf(levelId) ?? currentLevel;
  const parentLevel = levelOf(shownLevel?.parent);
  const scope: SidebarScope | undefined =
    shownLevel && parentLevel
      ? {
          id: shownLevel.id,
          back: { id: parentLevel.id, label: parentLevel.label, level: parentLevel.id },
          sections: shownLevel.sections
        }
      : scopeProp;
  const trail: string[] = [];
  for (let entry = currentLevel; entry; entry = levelOf(entry.parent)) trail.push(entry.id);
  const shownSections =
    scope?.sections ?? shownLevel?.sections ?? activeSpace?.sections ?? sections ?? [];
  const shell = useAppShell();
  const mode = shell?.mode ?? "wide";
  const narrow = mode === "narrow";
  const sheeted = Boolean(shell) && mode !== "wide";
  const setHasNavigation = shell?.setHasNavigation;
  React.useEffect(() => {
    if (!setHasNavigation) return undefined;
    setHasNavigation(true);
    return () => setHasNavigation(false);
  }, [setHasNavigation]);
  const unread = (announcements?.unread ?? 0) > 0;
  const setNavigationUnread = shell?.setNavigationUnread;
  React.useEffect(() => {
    if (!setNavigationUnread) return undefined;
    setNavigationUnread(unread);
    return () => setNavigationUnread(false);
  }, [setNavigationUnread, unread]);
  const setNavigationOpen = shell?.setNavigationOpen;
  const openedAt = React.useRef(current);
  React.useEffect(() => {
    if (!sheeted || !setNavigationOpen) return;
    if (openedAt.current !== current) setNavigationOpen(false);
    openedAt.current = current;
  }, [current, sheeted, setNavigationOpen]);
  const navigationToggle = shell?.navigationToggle;
  React.useEffect(() => {
    if (!navigationToggle) return undefined;
    navigationToggle.current = () => {
      if (sheeted) setNavigationOpen?.(!shell?.navigationOpen);
      else if (collapsible) setCollapsed(!isCollapsed);
    };
    return () => {
      navigationToggle.current = null;
    };
  });
  const setSlot = shell?.setSlot;
  const slotRefs = React.useMemo(() => {
    const bind = (slot: ShellSheetSlot) => (node: HTMLElement | null) => setSlot?.(slot, node);
    return {
      org: bind("org"),
      switchers: bind("switchers"),
      account: bind("account"),
      icons: bind("icons")
    };
  }, [setSlot]);
  const [helpSheetOpen, setHelpSheetOpen] = React.useState(false);
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const railed = mode === "rail" || (!narrow && collapsible && isCollapsed);
  const chrome = useShellChrome();
  useReportPresence(chrome?.sidebar, !narrow);
  useReportPresence(chrome?.sidebarOpen, !narrow && !railed);
  const view = scope?.id ?? activeSpace?.id ?? "root";
  const navRef = React.useRef<HTMLDivElement>(null);
  const backRef = React.useRef<HTMLElement | null>(null);
  const refocus = React.useRef(false);
  const keyed = React.useRef(false);
  const navigate = (item: SidebarLink) => {
    if (item.level) {
      refocus.current = keyed.current;
      setLevelId(item.level);
    }
    onNavigate?.(item);
  };
  const lastScope = React.useRef(scope);
  const [enter, setEnter] = React.useState<"forward" | "back">();
  React.useEffect(() => {
    const previous = lastScope.current;
    lastScope.current = scope;
    if (previous?.id === scope?.id) return;
    setEnter(!scope || previous?.back.id === scope.id ? "back" : "forward");
    if (!refocus.current) return;
    refocus.current = false;
    navRef.current?.querySelector<HTMLElement>("[data-sidebar-target]")?.focus();
  }, [scope, navRef]);
  const goUp = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!scope) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    if (event.key !== "Backspace" && !(event.altKey && event.key === "ArrowLeft")) return;
    event.preventDefault();
    refocus.current = true;
    backRef.current?.click();
  };
  const spaceRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const hasUpdates = (entry: SidebarSpace) =>
    entry.id !== activeSpace?.id && sectionsTotal(entry.sections) > 0;
  const panel = (inSheet: boolean) => {
    const rail = !inSheet && railed;
    const tooltipSide = rail ? "right" : "top";
    const helpLabel = help?.label ?? "Help";
    const announcementsLabel = announcements?.label ?? "What's new";
    const toggle =
      !inSheet && (mode === "rail" || collapsible) ? (
        <Tooltip
          content={rail ? "Expand sidebar" : "Collapse sidebar"}
          shortcut={shell ? "mod+B" : undefined}
          side={tooltipSide}
        >
          <button
            ref={toggleRef}
            type="button"
            className={styles.tool}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={mode === "rail" ? Boolean(shell?.navigationOpen) : !rail}
            onClick={() => {
              if (mode === "rail") setNavigationOpen?.(true);
              else setCollapsed(!isCollapsed);
            }}
          >
            <Icon name="sidebar" size={18} />
          </button>
        </Tooltip>
      ) : null;
    const cornerEnd = (announcements || help) && (
      <span className={styles.cornerEnd}>
        {announcements && (
          <Tooltip content={announcementsLabel} side={tooltipSide}>
            <span className={styles.marked}>
              <button
                type="button"
                className={styles.tool}
                aria-label={
                  unread
                    ? `${announcementsLabel}, ${announcements.unread} unread`
                    : announcementsLabel
                }
                onClick={announcements.onClick}
              >
                <Icon name="megaphone" size={18} />
              </button>
              {unread && <span className={styles.unread} aria-hidden="true" />}
            </span>
          </Tooltip>
        )}
        {help &&
          (inSheet && narrow ? (
            <Tooltip content={helpLabel} side={tooltipSide}>
              <button
                type="button"
                className={styles.tool}
                aria-label={helpLabel}
                aria-haspopup="dialog"
                aria-expanded={helpSheetOpen}
                onClick={() => setHelpSheetOpen(true)}
              >
                <Icon icon={CircleHelp} size={18} />
              </button>
            </Tooltip>
          ) : (
            <DropdownMenu modal={false}>
              <Tooltip content={helpLabel} side={tooltipSide}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={styles.tool} aria-label={helpLabel}>
                    <Icon icon={CircleHelp} size={18} />
                  </button>
                </DropdownMenuTrigger>
              </Tooltip>
              <HelpMenu help={help} rail={rail} />
            </DropdownMenu>
          ))}
      </span>
    );
    return (
      <aside
        data-slot="sidebar"
        data-collapsed={rail || undefined}
        data-sheet={inSheet || undefined}
        data-edge={edge || undefined}
        className={cn(styles.sidebar, className)}
      >
        {header}
        {inSheet && (
          <>
            <div className={styles.sheetHead}>
              <div ref={slotRefs.org} className={styles.sheetOrg} />
              <Tooltip content="Close navigation" shortcut="mod+B" side="bottom">
                <button
                  type="button"
                  className={styles.tool}
                  aria-label="Close navigation"
                  onClick={() => setNavigationOpen?.(false)}
                >
                  <Icon name="x" size={18} />
                </button>
              </Tooltip>
            </div>
            <div ref={slotRefs.switchers} className={styles.sheetSwitchers} />
          </>
        )}
        {!scope && spaces && activeSpace && !rail && (
          <Tabs
            className={styles.spaces}
            width="full"
            value={activeSpace.id}
            onValueChange={setSpaceId}
          >
            <TabsList variant="segmented" aria-label={spacesLabel}>
              {spaces.map((entry) => (
                <TabsTrigger key={entry.id} value={entry.id} className={styles.spaceTab}>
                  {entry.label}
                  {hasUpdates(entry) && (
                    <>
                      <span className={styles.spaceDot} aria-hidden="true" />
                      <span className={styles.srOnly}>, has updates</span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        {!scope && spaces && activeSpace && rail && (
          <div className={styles.railSpacesShelf}>
            <div
              role="tablist"
              aria-label={spacesLabel}
              aria-orientation="vertical"
              className={styles.railSpaces}
            >
              {spaces.map((entry, index) => {
                const selected = entry.id === activeSpace.id;
                return (
                  <Tooltip key={entry.id} content={entry.label} side="right">
                    <button
                      ref={(node) => {
                        spaceRefs.current[index] = node;
                      }}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      aria-label={hasUpdates(entry) ? `${entry.label}, has updates` : entry.label}
                      className={styles.railSpace}
                      onClick={() => setSpaceId(entry.id)}
                      onKeyDown={(event) => {
                        const step = ["ArrowDown", "ArrowRight"].includes(event.key)
                          ? 1
                          : ["ArrowUp", "ArrowLeft"].includes(event.key)
                            ? -1
                            : 0;
                        if (!step) return;
                        event.preventDefault();
                        const next = (index + step + spaces.length) % spaces.length;
                        setSpaceId(spaces[next].id);
                        spaceRefs.current[next]?.focus();
                      }}
                    >
                      <Icon name={entry.icon} size={18} />
                      {hasUpdates(entry) && <span className={styles.railDot} aria-hidden="true" />}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}
        <nav
          aria-label={label ?? (activeSpace ? `${activeSpace.label} navigation` : "Main")}
          className={styles.navigation}
          onKeyDown={(event) => {
            keyed.current = event.key === "Enter" || event.key === " ";
            goUp(event);
            moveFocus(event);
          }}
          onPointerDown={() => {
            keyed.current = false;
          }}
        >
          <div
            ref={navRef}
            key={view}
            data-enter={enter}
            data-scroll-fade="y"
            className={styles.nav}
          >
            {scope && (
              <div
                className={styles.section}
                ref={(node) => {
                  backRef.current = node?.querySelector<HTMLElement>("[data-sidebar-back]") ?? null;
                }}
              >
                <SidebarRow
                  item={{ ...scope.back, icon: "chev-left" }}
                  rail={rail}
                  back
                  onNavigate={navigate}
                />
              </div>
            )}
            {shownSections.map((section, index) => (
              <div key={section.label ?? index} className={styles.section}>
                {section.label && (
                  <p className={styles.sectionLabel}>
                    <span>{section.label}</span>
                  </p>
                )}
                <SidebarItems
                  items={
                    rail && section.icon && section.label
                      ? [
                          {
                            id: `section-${section.label}`,
                            label: section.label,
                            icon: section.icon,
                            children: section.items
                          }
                        ]
                      : section.items
                  }
                  current={current}
                  rail={rail}
                  onNavigate={navigate}
                />
              </div>
            ))}
            <ListHighlight />
          </div>
          {footerItems && footerItems.length > 0 && (
            <div className={styles.footer}>
              <SidebarItems
                items={footerItems}
                current={current}
                rail={rail}
                onNavigate={navigate}
              />
            </div>
          )}
        </nav>
        {inSheet && narrow && <div ref={slotRefs.account} className={styles.sheetAccount} />}
        {(toggle || cornerEnd || (inSheet && narrow)) && (
          <div className={styles.corner} data-has-end={Boolean(cornerEnd) || undefined}>
            {toggle}
            {inSheet && narrow && <span ref={slotRefs.icons} className={styles.cornerSlot} />}
            {cornerEnd}
          </div>
        )}
      </aside>
    );
  };
  const sheetLabel = label ?? (activeSpace ? `${activeSpace.label} navigation` : "Main");
  return (
    <LevelTrail value={trail}>
      <TooltipProvider>
        {!narrow && panel(false)}
        {sheeted && shell && (
          <Sheet open={shell.navigationOpen} onOpenChange={shell.setNavigationOpen}>
            <SheetContent
              side="left"
              showCloseButton={false}
              aria-describedby={undefined}
              className={styles.sheet}
              style={{ width: "fit-content" }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                (narrow ? shell.navigationTrigger.current : toggleRef.current)?.focus();
              }}
              onOpenAutoFocus={(event) => {
                const target = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
                  '[aria-current="page"]'
                );
                if (!target) return;
                event.preventDefault();
                target.focus();
              }}
            >
              <SheetTitle className={styles.srOnly}>{sheetLabel}</SheetTitle>
              {panel(true)}
            </SheetContent>
          </Sheet>
        )}
        {help && narrow && (
          <HelpSheet help={help} open={helpSheetOpen} onOpenChange={setHelpSheetOpen} />
        )}
      </TooltipProvider>
    </LevelTrail>
  );
};

const sidebarLinks = ({ sections, levels, scope, spaces, footerItems }: SidebarProps) =>
  [
    ...(sections ?? []),
    ...(levels ?? []).flatMap((entry) => entry.sections),
    ...(scope?.sections ?? []),
    ...(spaces ?? []).flatMap((entry) => entry.sections)
  ]
    .flatMap((section) => section.items)
    .concat(footerItems ?? [])
    .flatMap((item) => [item, ...(item.children ?? [])])
    .filter((item) => item.link);

const RoutedSidebar = ({ links, ...props }: SidebarProps & { links: readonly SidebarLink[] }) => {
  const match = useCipherLinkMatch();
  let routed: { id: string; rank: number } | undefined;
  links.forEach((item) => {
    const found = item.link && match(item.link);
    if (!found) return;
    const rank = (found.exact ? 1e6 : 0) + found.length;
    if (!routed || rank > routed.rank) routed = { id: item.id, rank };
  });
  return <SidebarView {...props} current={routed?.id ?? props.current} />;
};

export const Sidebar = (props: SidebarProps) => {
  const links = sidebarLinks(props);
  return links.length ? <RoutedSidebar {...props} links={links} /> : <SidebarView {...props} />;
};
