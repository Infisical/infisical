import * as React from "react";
import { cn } from "cn";

import { useControllableState } from "../lib/use-controllable-state";
import { Avatar, Identity } from "./avatar";
import { Count } from "./badge";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { Icon, type IconName } from "./icon";
import { Switcher, type SwitcherAction, type SwitcherActionDivider } from "./switcher";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import { Tooltip, TooltipProvider } from "./tooltip";

import styles from "./sidebar.module.css";

export interface SidebarLink {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
  onClick?: () => void;
  count?: number;
  external?: boolean;
  disabled?: boolean;
}
export interface SidebarItem extends SidebarLink {
  children?: readonly SidebarLink[];
  defaultOpen?: boolean;
}
export interface SidebarSection {
  label?: string;
  items: readonly SidebarItem[];
}
export interface SidebarUser {
  name: string;
  email: string;
  initials?: string;
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
  sections: readonly SidebarSection[];
  current?: string;
  onNavigate?: (item: SidebarLink) => void;
  search?: { onClick: () => void; label?: string; shortcut?: string } | false;
  invite?: { onClick: () => void; label?: string } | false;
  user: SidebarUser;
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

const RowContent = ({
  item,
  count,
  trailing
}: {
  item: SidebarLink;
  count?: number;
  trailing?: React.ReactNode;
}) => (
  <>
    <Icon name={item.icon} size={18} className={styles.icon} />
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

const SidebarRow = ({
  item,
  current,
  rail,
  child,
  onNavigate
}: {
  item: SidebarLink;
  current?: string;
  rail: boolean;
  child?: boolean;
  onNavigate?: SidebarProps["onNavigate"];
}) => {
  const isCurrent = item.id === current;
  const shared = {
    className: styles.row,
    "data-sidebar-target": "",
    "data-current": isCurrent || undefined,
    "data-child": child || undefined,
    "aria-current": isCurrent ? ("page" as const) : undefined,
    "aria-label": rail ? item.label : undefined,
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
      <RowContent item={item} count={item.count} />
    </a>
  ) : (
    <button {...shared} type="button" disabled={item.disabled}>
      <RowContent item={item} count={item.count} />
    </button>
  );
  return rail ? (
    <Tooltip content={item.label} side="right">
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
                </a>
              ) : (
                <span>{childItem.label}</span>
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
          trailing={
            <Icon
              name="chev-down"
              size={14}
              className={styles.trailing}
              data-open={open || undefined}
            />
          }
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
  current,
  onNavigate,
  search,
  invite,
  user,
  org,
  theme,
  footerItems,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  collapsible = true,
  header,
  edge = true,
  label = "Main",
  className
}: SidebarProps) => {
  const [isCollapsed, setCollapsed] = useControllableState({
    value: collapsed,
    defaultValue: defaultCollapsed,
    onChange: onCollapsedChange
  });
  const rail = collapsible && isCollapsed;
  const tooltipSide = rail ? "right" : "bottom";
  const userAvatar = <Avatar size={20} name={user.name} initials={user.initials} />;
  const account = (
    <button
      type="button"
      className={styles.account}
      aria-label={org ? `${user.name}, ${org.name}` : user.name}
    >
      {userAvatar}
      <span className={styles.accountText}>
        <span className={styles.accountName}>{user.name}</span>
        <span className={styles.accountMeta}>{org ? org.name : user.email}</span>
      </span>
      <Icon name="chev-ud" size={14} className={styles.trailing} />
    </button>
  );
  const hasMenu = Boolean(org || user.items?.length || theme || user.href || user.onClick);
  return (
    <TooltipProvider>
      <aside
        data-slot="sidebar"
        data-collapsed={rail || undefined}
        data-edge={edge || undefined}
        className={cn(styles.sidebar, className)}
      >
        {header}
        <div className={styles.tools}>
          {collapsible && (
            <Tooltip content={rail ? "Expand sidebar" : "Collapse sidebar"} side={tooltipSide}>
              <Button
                variant="ghost"
                size="icon"
                icon="sidebar"
                iconOnly
                className={styles.tool}
                onClick={() => setCollapsed(!isCollapsed)}
              >
                {rail ? "Expand sidebar" : "Collapse sidebar"}
              </Button>
            </Tooltip>
          )}
          <span className={styles.toolsEnd}>
            {search && (
              <Tooltip
                content={search.label ?? "Search"}
                shortcut={search.shortcut ?? "mod+K"}
                side={tooltipSide}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  icon="search"
                  iconOnly
                  className={styles.tool}
                  onClick={search.onClick}
                >
                  {search.label ?? "Search"}
                </Button>
              </Tooltip>
            )}
            {invite && (
              <Tooltip content={invite.label ?? "Invite members"} side={tooltipSide}>
                <Button
                  variant="ghost"
                  size="icon"
                  icon="user-plus"
                  iconOnly
                  className={styles.tool}
                  onClick={invite.onClick}
                >
                  {invite.label ?? "Invite members"}
                </Button>
              </Tooltip>
            )}
          </span>
        </div>
        <nav aria-label={label} className={styles.navigation} onKeyDown={moveFocus}>
          <div className={styles.nav}>
            {sections.map((section, index) => (
              <div key={section.label ?? index} className={styles.section}>
                {section.label && (
                  <p className={styles.sectionLabel}>
                    <span>{section.label}</span>
                  </p>
                )}
                <SidebarItems
                  items={section.items}
                  current={current}
                  rail={rail}
                  onNavigate={onNavigate}
                />
              </div>
            ))}
          </div>
          {footerItems && footerItems.length > 0 && (
            <div className={styles.footer}>
              <SidebarItems
                items={footerItems}
                current={current}
                rail={rail}
                onNavigate={onNavigate}
              />
            </div>
          )}
        </nav>
        <div className={styles.accountShelf}>
          {hasMenu ? (
            <Switcher
              label={org ? "Switch organization" : "Account"}
              width={264}
              side={rail ? "right" : "top"}
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
                          <Tooltip key={option.value} content={option.label}>
                            <ToggleGroupItem value={option.value} aria-label={option.label}>
                              <Icon name={option.icon} size={14} />
                            </ToggleGroupItem>
                          </Tooltip>
                        ))}
                      </ToggleGroup>
                    </div>
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
                <span className={styles.accountMeta}>{user.email}</span>
              </span>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
};
