import * as React from "react";

import { AnimatedCollapse } from "./animated-collapse";
import { Icon, type IconName } from "./icon";
import { MiddleTruncate } from "./middle-truncate";

import styles from "./data.module.css";

export interface FileTreeNode {
  id: string;
  name: string;
  type?: "file" | "folder";
  children?: readonly FileTreeNode[];
  meta?: React.ReactNode;
  icon?: IconName;
  disabled?: boolean;
  label?: string;
}
export interface FileTreeProps {
  items: readonly FileTreeNode[];
  label: string;
  expanded?: readonly string[];
  defaultExpanded?: readonly string[];
  onExpandedChange?: (ids: string[]) => void;
  selected?: string | null;
  defaultSelected?: string | null;
  onSelect?: (id: string, node: FileTreeNode) => void;
  selectable?: "all" | "files" | "folders" | "none";
  foldersOnly?: boolean;
  size?: "sm" | "md";
  maxHeight?: number;
  truncate?: "middle" | "end";
  empty?: React.ReactNode;
}
const folder = (node: FileTreeNode) =>
  node.type ? node.type === "folder" : node.children !== undefined;
function selectedAncestors(
  nodes: readonly FileTreeNode[],
  selected: string | null
): string[] | null {
  if (selected === null) return [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) return null;
    if (node.id === selected) return [];
    const childPath = selectedAncestors(node.children ?? [], selected);
    if (childPath) return [node.id, ...childPath];
  }
  return null;
}
export function FileTree({
  items,
  label,
  expanded,
  defaultExpanded = [],
  onExpandedChange,
  selected,
  defaultSelected = null,
  onSelect,
  selectable = "all",
  foldersOnly = false,
  size = "md",
  maxHeight,
  truncate = "middle",
  empty = "No files"
}: FileTreeProps) {
  const [ownExpanded, setOwnExpanded] = React.useState<readonly string[]>(() => [
    ...new Set([
      ...defaultExpanded,
      ...(selectedAncestors(items, selected ?? defaultSelected) ?? [])
    ])
  ]);
  const [ownSelected, setOwnSelected] = React.useState<string | null>(defaultSelected);
  const [focused, setFocused] = React.useState<string | null>(null);
  const open = expanded ?? ownExpanded;
  const current = selected === undefined ? ownSelected : selected;
  const revealedSelection = React.useRef<string | null>(undefined);
  React.useEffect(() => {
    if (revealedSelection.current === current) return;
    const ancestors = selectedAncestors(items, current);
    if (!ancestors) return;
    revealedSelection.current = current;
    const next = [...new Set([...open, ...ancestors])];
    if (next.length !== open.length) {
      if (expanded === undefined) setOwnExpanded(next);
      onExpandedChange?.(next);
    }
  }, [current, items, open, expanded, onExpandedChange]);
  const targets = React.useRef(new Map<string, HTMLLIElement>());
  const tree = React.useRef<HTMLUListElement>(null);
  const focusWithin = React.useRef(false);
  const search = React.useRef({ text: "", time: 0 });
  const uid = React.useId();
  const visible: { node: FileTreeNode; parent: string | null }[] = [];
  const flatten = (nodes: readonly FileTreeNode[], parent: string | null) => {
    nodes.forEach((node) => {
      if (foldersOnly && !folder(node)) return;
      visible.push({ node, parent });
      if (open.includes(node.id)) flatten(node.children ?? [], node.id);
    });
  };
  flatten(items, null);
  const first = visible[0]?.node.id;
  const focusId =
    focused && visible.some(({ node }) => node.id === focused)
      ? focused
      : current && visible.some(({ node }) => node.id === current)
        ? current
        : first;
  const expand = (id: string, value: boolean) => {
    const next = value ? [...open.filter((x) => x !== id), id] : open.filter((x) => x !== id);
    if (expanded === undefined) setOwnExpanded(next);
    onExpandedChange?.(next);
  };
  const focus = (id: string | undefined) => {
    if (id) {
      setFocused(id);
      targets.current.get(id)?.focus();
    }
  };
  React.useLayoutEffect(() => {
    if (!focused || visible.some(({ node }) => node.id === focused)) return;
    const parents = new Map<string, string | null>();
    const visit = (nodes: readonly FileTreeNode[], parent: string | null) =>
      nodes.forEach((node) => {
        parents.set(node.id, parent);
        visit(node.children ?? [], node.id);
      });
    visit(items, null);
    const visibleIds = new Set(visible.map(({ node }) => node.id));
    let next = parents.get(focused);
    while (next && !visibleIds.has(next)) next = parents.get(next);
    const target = next ?? first;
    if (target) {
      setFocused(target);
      if (focusWithin.current) targets.current.get(target)?.focus();
    }
  }, [focused, open, items, foldersOnly]);
  const canSelect = (node: FileTreeNode) =>
    !node.disabled &&
    (selectable === "all" ||
      (selectable === "files" && !folder(node)) ||
      (selectable === "folders" && folder(node)));
  const pick = (node: FileTreeNode) => {
    if (canSelect(node)) {
      if (selected === undefined) setOwnSelected(node.id);
      onSelect?.(node.id, node);
    } else if (folder(node) && !node.disabled) expand(node.id, !open.includes(node.id));
  };
  const onKey = (event: React.KeyboardEvent<HTMLLIElement>, node: FileTreeNode) => {
    if (event.target !== event.currentTarget) return;
    const index = visible.findIndex((entry) => entry.node.id === node.id);
    const parent = visible[index]?.parent;
    let handled = true;
    switch (event.key) {
      case "ArrowDown":
        focus(visible[Math.min(visible.length - 1, index + 1)]?.node.id);
        break;
      case "ArrowUp":
        focus(visible[Math.max(0, index - 1)]?.node.id);
        break;
      case "Home":
        focus(visible[0]?.node.id);
        break;
      case "End":
        focus(visible[visible.length - 1]?.node.id);
        break;
      case "ArrowRight":
        if (folder(node) && !node.disabled) {
          if (!open.includes(node.id)) expand(node.id, true);
          else
            focus(visible[index + 1]?.parent === node.id ? visible[index + 1]?.node.id : undefined);
        }
        break;
      case "ArrowLeft":
        if (folder(node) && open.includes(node.id)) expand(node.id, false);
        else focus(parent ?? undefined);
        break;
      case "Enter":
      case " ":
        pick(node);
        break;
      default:
        handled = false;
        if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.nativeEvent.isComposing
        ) {
          const now = Date.now();
          search.current = {
            text: now - search.current.time < 500 ? search.current.text + event.key : event.key,
            time: now
          };
          const rest = [...visible.slice(index + 1), ...visible.slice(0, index + 1)];
          focus(
            rest.find((entry) =>
              entry.node.name.toLowerCase().startsWith(search.current.text.toLowerCase())
            )?.node.id
          );
        }
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const render = (nodes: readonly FileTreeNode[], level: number): React.ReactNode =>
    nodes
      .filter((node) => !foldersOnly || folder(node))
      .map((node, index, shown) => (
        <li
          key={node.id}
          ref={(element) => {
            if (element) targets.current.set(node.id, element);
            else targets.current.delete(node.id);
          }}
          role="treeitem"
          aria-level={level}
          aria-setsize={shown.length}
          aria-posinset={index + 1}
          aria-expanded={folder(node) ? open.includes(node.id) : undefined}
          aria-selected={current === node.id}
          aria-disabled={node.disabled || undefined}
          aria-label={node.label ?? node.name}
          tabIndex={focusId === node.id ? 0 : -1}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocused(node.id);
          }}
          onKeyDown={(event) => onKey(event, node)}
          onClick={(event) => {
            event.stopPropagation();
            focus(node.id);
            pick(node);
          }}
        >
          <div
            className={styles.treeRow}
            data-size={size}
            data-selected={current === node.id}
            aria-disabled={node.disabled || undefined}
          >
            {folder(node) && (
              <button
                type="button"
                tabIndex={-1}
                disabled={node.disabled}
                aria-label={`${open.includes(node.id) ? "Collapse" : "Expand"} ${node.name}`}
                aria-expanded={open.includes(node.id)}
                aria-controls={`${uid}-${node.id}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  focus(node.id);
                  expand(node.id, !open.includes(node.id));
                }}
              >
                {" "}
                {open.includes(node.id) ? "▾" : "▸"}{" "}
              </button>
            )}
            <Icon
              name={
                node.icon ??
                (folder(node) ? (open.includes(node.id) ? "folder-open" : "folder") : "file")
              }
            />
            <span className={styles.treeName} title={node.name}>
              {truncate === "middle" ? <MiddleTruncate text={node.name} keepEnd={8} /> : node.name}
            </span>
            {node.meta && <span className={styles.treeMeta}>{node.meta}</span>}
          </div>
          {folder(node) && (
            <AnimatedCollapse open={open.includes(node.id)} lazy>
              <ul role="group" id={`${uid}-${node.id}`}>
                {render(node.children ?? [], level + 1)}
              </ul>
            </AnimatedCollapse>
          )}
        </li>
      ));
  return visible.length ? (
    <ul
      ref={tree}
      role="tree"
      aria-label={label}
      data-slot="file-tree"
      data-size={size}
      className={styles.tree}
      style={{ maxHeight }}
      onFocusCapture={() => {
        focusWithin.current = true;
      }}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          focusWithin.current = false;
      }}
    >
      {render(items, 1)}
    </ul>
  ) : (
    <div className={styles.empty}>{empty}</div>
  );
}
