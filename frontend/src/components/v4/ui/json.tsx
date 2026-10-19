/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Named scroll regions need keyboard focus for scrolling. */
import * as React from "react";
import { cn } from "cn";

import { AnimatedCollapse } from "./animated-collapse";
import { Code } from "./code";
import { type JsonNode, type JsonValue, prepareJson, type Redaction } from "./json-model";

import styles from "./code.module.css";

export type { JsonValue } from "./json-model";
export { prepareJson, redactJson } from "./json-model";
export type JsonProps = {
  value: JsonValue;
  defaultExpandDepth?: number;
  redact?: Redaction;
  wrap?: boolean;
  maxLines?: number;
  maxHeight?: React.CSSProperties["maxHeight"];
  label?: string;
  className?: string;
  maxDepth?: number;
  maxNodes?: number;
};
type PreviewNode = { node: JsonNode; name?: string; children?: PreviewNode[]; limited?: boolean };
function preview(
  node: JsonNode,
  depth: number,
  maxDepth: number,
  budget: { remaining: number },
  name?: string
): PreviewNode {
  const result: PreviewNode = { node, name };
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > maxDepth) return { ...result, limited: true };
  if (node.kind === "scalar") return result;
  const entries =
    node.kind === "array"
      ? node.items.map((child) => ({ node: child, key: undefined }))
      : node.entries;
  result.children = [];
  entries.forEach((entry) => {
    if (budget.remaining <= 0) result.limited = true;
    else result.children?.push(preview(entry.node, depth + 1, maxDepth, budget, entry.key));
  });
  return result;
}
const TreeNode = ({
  item,
  depth,
  expanded
}: {
  item: PreviewNode;
  depth: number;
  expanded: number;
}) => {
  const [open, setOpen] = React.useState(depth < expanded);
  const id = React.useId();
  const prefix =
    item.name === undefined ? null : (
      <>
        <span className={styles.key}>{JSON.stringify(item.name)}</span>
        <span className={styles.punctuation}>: </span>
      </>
    );
  if (item.node.kind === "scalar")
    return (
      <div className={styles.entry}>
        <span className={styles.treeCaret} aria-hidden="true" />
        {prefix}
        <span className={item.node.raw.startsWith('"') ? styles.string : styles.primitive}>
          {item.node.raw}
        </span>
      </div>
    );
  const array = item.node.kind === "array";
  const count = item.node.kind === "array" ? item.node.items.length : item.node.entries.length;
  return (
    <div className={styles.treeNode}>
      <button
        type="button"
        className={styles.treeToggle}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className={cn(styles.treeCaret, styles.punctuation)} aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span>
          {prefix}
          <span className={styles.punctuation}>
            {array ? "[" : "{"} … {array ? "]" : "}"} {count} {array ? "items" : "keys"}
          </span>
        </span>
      </button>
      <AnimatedCollapse id={id} open={open} lazy>
        <div className={styles.treeChildren}>
          {item.children?.map((child, index) => (
            <TreeNode
              key={`${index}-${child.name ?? ""}`}
              item={child}
              depth={depth + 1}
              expanded={expanded}
            />
          ))}
          {item.limited && (
            <p className={styles.notice}>
              Preview limit reached. Copy retains the complete safe payload.
            </p>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
};
export const Json = ({
  value,
  redact,
  defaultExpandDepth = 2,
  wrap = false,
  maxLines,
  maxHeight,
  label = "JSON data",
  className,
  maxDepth = 12,
  maxNodes = 500
}: JsonProps) => {
  const safe = prepareJson(value, redact);
  const tree = safe.document
    ? preview(
        safe.document,
        0,
        Number.isFinite(maxDepth) ? Math.max(0, Math.min(maxDepth, 32)) : 12,
        {
          remaining: Number.isFinite(maxNodes) ? Math.max(1, Math.min(maxNodes, 2000)) : 500
        }
      )
    : null;
  if (!tree)
    return (
      <div>
        {safe.notice && (
          <p role="status" className={styles.notice}>
            {safe.notice}
          </p>
        )}
        <Code
          block
          code={safe.text.slice(0, 20000)}
          wrap={wrap}
          maxLines={maxLines}
          maxHeight={maxHeight}
          label={label}
          className={className}
        />
        {safe.text.length > 20000 && (
          <p className={styles.notice}>
            Preview shortened. Copy retains the complete safe payload.
          </p>
        )}
      </div>
    );
  return (
    <div
      data-slot="json"
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(styles.tree, wrap && styles.wrap, className)}
      style={{
        maxHeight:
          maxHeight ??
          (maxLines ? `calc(${maxLines} * 1lh + 2 * var(--v4-space-surface-inset))` : undefined)
      }}
    >
      <TreeNode key={safe.text} item={tree} depth={0} expanded={defaultExpandDepth} />
    </div>
  );
};
