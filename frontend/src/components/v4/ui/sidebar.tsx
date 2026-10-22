import * as React from "react";

import { ListHighlight } from "../lib/list-highlight";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Avatar, Identity } from "./avatar";
import { Count } from "./badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { Icon, type IconName } from "./icon";
import { Sheet, SheetContent, SheetTitle } from "./sheet";
import { Switcher, type SwitcherAction, type SwitcherActionDivider } from "./switcher";
import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import { Tooltip, TooltipProvider } from "./tooltip";
import { useAppShell } from "./top-bar";

import menu from "./menu.module.css";
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
export interface SidebarUser {
  name: string;
  email: string;
  initials?: string;
  media?: React.ReactNode;
  meta?: string;
  items?: (SwitcherAction | SwitcherActionDivider)[];
  href?: string;
  onClick?: () => void;
  settingsLabel?: string;
}
export interface SidebarOrganization {
  name: string;
  plan?: string;
  options: { value: string; label: string; plan?: string }[];
  value: string;
  onChange: (value: string) => void;
  actions?: (SwitcherAction | SwitcherActionDivider)[];
  optionsLabel?: string;
}
export type SidebarTheme = "light" | "dark" | "system";
export interface SidebarProps {
  sections?: readonly SidebarSection[];
  scope?: SidebarScope;
  spaces?: readonly SidebarSpace[];
  space?: string;
  defaultSpace?: string;
  onSpaceChange?: (space: string) => void;
  spacesLabel?: string;
  current?: string;
  onNavigate?: (item: SidebarLink) => void;
  search?: { onClick: () => void; label?: string; shortcut?: string } | false;
  invite?: { onClick: () => void; label?: string } | false;
  user?: SidebarUser;
  org?: SidebarOrganization;
  theme?: { value: SidebarTheme; onChange: (value: SidebarTheme) => void; label?: string };
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
  const drillIn = !back && item.drillIn;
  const shared = {
    className: cn(styles.row, back && styles.back),
    "data-sidebar-back": back || undefined,
    "data-sidebar-target": "",
    "data-current": isCurrent || undefined,
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
  const row = item.href ? (
    <a
      {...shared}
      href={item.disabled ? undefined : item.href}
      aria-disabled={item.disabled || undefined}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noreferrer" : undefined}
    >
      <RowContent
        item={item}
        count={item.count}
        child={child}
        trailing={drillIn && !rail ? drill : undefined}
      />
    </a>
  ) : (
    <button {...shared} type="button" disabled={item.disabled}>
      <RowContent
        item={item}
        count={item.count}
        child={child}
        trailing={drillIn && !rail ? drill : undefined}
      />
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
              asChild={Boolean(childItem.href)}
            >
              {childItem.href ? (
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

const themeOptions: { value: SidebarTheme; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" }
];

export const Sidebar = ({
  sections,
  scope,
  spaces,
  space,
  defaultSpace,
  onSpaceChange,
  spacesLabel = "Navigation",
  current,
  onNavigate,
  search,
  invite,
  user: accountUser,
  org,
  theme,
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
  const shownSections = scope?.sections ?? activeSpace?.sections ?? sections ?? [];
  const shell = useAppShell();
  const setHasNavigation = shell?.setHasNavigation;
  React.useEffect(() => {
    if (!setHasNavigation) return undefined;
    setHasNavigation(true);
    return () => setHasNavigation(false);
  }, [setHasNavigation]);
  const sheet = Boolean(shell?.narrow);
  const setNavigationOpen = shell?.setNavigationOpen;
  const openedAt = React.useRef(current);
  React.useEffect(() => {
    if (!sheet || !setNavigationOpen) return;
    if (openedAt.current !== current) setNavigationOpen(false);
    openedAt.current = current;
  }, [current, sheet, setNavigationOpen]);
  const navigate = onNavigate;
  const rail = !sheet && collapsible && isCollapsed;
  const view = scope?.id ?? activeSpace?.id ?? "root";
  const navRef = React.useRef<HTMLDivElement>(null);
  const backRef = React.useRef<HTMLElement | null>(null);
  const refocus = React.useRef(false);
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
  const tooltipSide = rail ? "right" : "bottom";
  const hasUpdates = (entry: SidebarSpace) =>
    entry.id !== activeSpace?.id && sectionsTotal(entry.sections) > 0;
  const tool = (toolLabel: string, icon: IconName, onClick: () => void, shortcut?: string) => (
    <Tooltip content={toolLabel} shortcut={shortcut} side={tooltipSide}>
      <button type="button" className={styles.tool} aria-label={toolLabel} onClick={onClick}>
        <Icon name={icon} size={18} />
      </button>
    </Tooltip>
  );
  const user = accountUser ?? { name: "", email: "" };
  const userAvatar = user.media ? (
    <span className={styles.accountMedia}>{user.media}</span>
  ) : (
    <Avatar size={20} name={user.name} initials={user.initials} />
  );
  const userMeta = user.meta ?? user.email;
  const account = (
    <button
      type="button"
      className={styles.account}
      aria-label={org ? `${user.name}, ${org.name}` : user.name}
    >
      {userAvatar}
      <span className={styles.accountText}>
        <span className={styles.accountName}>{user.name}</span>
        <span className={styles.accountMeta}>{org ? org.name : userMeta}</span>
      </span>
      <Icon name="chev-ud" size={16} className={styles.trailing} />
    </button>
  );
  const hasMenu = Boolean(org || user.items?.length || theme || user.href || user.onClick);
  const content = (
    <TooltipProvider>
      <aside
        data-slot="sidebar"
        data-collapsed={rail || undefined}
        data-sheet={sheet || undefined}
        data-edge={edge || undefined}
        className={cn(styles.sidebar, className)}
      >
        {header}
        <div className={styles.tools}>
          {sheet
            ? tool("Close navigation", "sidebar", () => shell?.setNavigationOpen(false))
            : collapsible &&
              tool(rail ? "Expand sidebar" : "Collapse sidebar", "sidebar", () =>
                setCollapsed(!isCollapsed)
              )}
          <span className={styles.toolsEnd}>
            {search &&
              tool(search.label ?? "Search", "search", search.onClick, search.shortcut ?? "mod+K")}
            {invite && tool(invite.label ?? "Invite members", "user-plus", invite.onClick)}
          </span>
        </div>
        {!scope && spaces && activeSpace && !rail && (
          <Tabs className={styles.spaces} value={activeSpace.id} onValueChange={setSpaceId}>
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
            goUp(event);
            moveFocus(event);
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
        {accountUser && (
          <div className={styles.accountShelf}>
            {hasMenu ? (
              <Switcher
                label={org ? "Switch organization" : "Account"}
                width={264}
                side={rail ? "right" : "top"}
                align="start"
                options={(org?.options ?? []).map((option) => ({
                  value: option.value,
                  label: option.label,
                  meta: option.plan,
                  group: org?.optionsLabel ?? "Organizations"
                }))}
                value={org?.value}
                onChange={(value) => org?.onChange(value)}
                actions={[
                  ...(org?.actions ?? []),
                  ...(org?.actions?.length && user.items?.length
                    ? [{ type: "separator" } as const]
                    : []),
                  ...(user.items ?? [])
                ]}
                footer={({ close }) => (
                  <>
                    {theme && (
                      <div className={styles.themeRow}>
                        <span>{theme.label ?? "Theme"}</span>
                        <ToggleGroup
                          type="single"
                          size="sm"
                          aria-label={theme.label ?? "Theme"}
                          value={theme.value}
                          onValueChange={(value) => {
                            if (value) theme.onChange(value as SidebarTheme);
                          }}
                        >
                          {themeOptions.map((option) => (
                            <ToggleGroupItem
                              key={option.value}
                              value={option.value}
                              aria-label={option.label}
                              title={option.label}
                            >
                              <Icon name={option.icon} size={14} />
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </div>
                    )}
                    {theme && (user.href || user.onClick) && (
                      <div role="separator" className={menu.separator} />
                    )}
                    {(user.href || user.onClick) &&
                      React.createElement(
                        user.href ? "a" : "button",
                        {
                          className: styles.userRow,
                          href: user.href,
                          type: user.href ? undefined : "button",
                          "aria-label": user.settingsLabel ?? "Personal settings",
                          onClick: () => {
                            user.onClick?.();
                            close();
                          }
                        },
                        <Identity name={user.name} description={user.email} />,
                        <Icon name="chev-right" size={14} className={styles.trailing} />
                      )}
                  </>
                )}
                trigger={account}
              />
            ) : (
              <div className={styles.account}>
                {userAvatar}
                <span className={styles.accountText}>
                  <span className={styles.accountName}>{user.name}</span>
                  <span className={styles.accountMeta}>{userMeta}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
  if (!sheet || !shell) return content;
  return (
    <Sheet open={shell.navigationOpen} onOpenChange={shell.setNavigationOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        aria-describedby={undefined}
        className={styles.sheet}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          shell.navigationTrigger.current?.focus();
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
        <SheetTitle className={styles.srOnly}>
          {label ?? (activeSpace ? `${activeSpace.label} navigation` : "Main")}
        </SheetTitle>
        {content}
      </SheetContent>
    </Sheet>
  );
};
