import * as React from "react";

import { Button } from "../ui/button";
import { Media } from "../ui/item";
import { List, ListFooter, ListHeader, ListRow, type ListRowProps, ListSection } from "../ui/list";
import { Skeleton } from "../ui/skeleton";

import styles from "./patterns.module.css";

interface ApprovalRequestBase {
  id: string;
  object: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  age: string;
  href?: string;
}
export type ApprovalRequest = ApprovalRequestBase &
  (
    | { state: "new" | "pending" | "resolved"; error?: never }
    | { state: "failed"; error: React.ReactNode }
  );

export type ApprovalQueueVariant = "framed" | "segmented" | "divided";

export const ApprovalQueueHeader: React.FC<{
  title: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
}> = () => null;

export interface ApprovalQueueItemProps {
  request: ApprovalRequest;
  current?: boolean;
  onApprove: (id: string) => void;
  onView?: (id: string) => void;
  onUndo?: (id: string) => void;
  onRetry: (id: string) => void;
}

function itemRow({
  request,
  current,
  onApprove,
  onView,
  onUndo,
  onRetry
}: ApprovalQueueItemProps): ListRowProps {
  const pending = request.state === "pending";
  let actions: React.ReactNode;
  if (request.state === "resolved")
    actions = onUndo && (
      <Button variant="link" size="sm" onClick={() => onUndo(request.id)}>
        Undo
      </Button>
    );
  else if (request.state === "failed")
    actions = (
      <Button variant="outline" size="sm" onClick={() => onRetry(request.id)}>
        Retry
      </Button>
    );
  else
    actions = (
      <>
        {onView && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onView(request.id)}>
            View diff
          </Button>
        )}
        <Button variant="accent" size="sm" loading={pending} onClick={() => onApprove(request.id)}>
          Approve
        </Button>
      </>
    );
  return {
    value: request.id,
    label: request.object,
    href: request.href,
    current,
    unread: request.state === "new",
    resolved: request.state === "resolved",
    media: (
      <Media
        icon={request.state === "failed" ? "alert" : "inbox"}
        tone={request.state === "failed" ? "bad" : undefined}
      />
    ),
    title: request.title,
    description: request.description,
    error: request.state === "failed" ? request.error : undefined,
    meta: request.age,
    actions
  };
}

export function ApprovalQueueItem(props: ApprovalQueueItemProps) {
  return <ListRow {...itemRow(props)} />;
}

export const ApprovalQueueGroup: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
}> = () => null;

export const ApprovalQueueList: React.FC<{
  label?: string;
  empty?: React.ReactNode;
  children?: React.ReactNode;
}> = () => null;

export const ApprovalQueueFooter: React.FC<{ children: React.ReactNode }> = () => null;

// List places its header, footer, sections and rows by element type, so the queue's parts are lowered to List's own parts before List sees them.
function lower(
  children: React.ReactNode,
  list: React.ComponentProps<typeof ApprovalQueueList>
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (child.type === React.Fragment)
      return lower((child.props as { children?: React.ReactNode }).children, list);
    if (child.type === ApprovalQueueItem)
      return <ListRow {...itemRow(child.props as ApprovalQueueItemProps)} />;
    if (child.type === ApprovalQueueGroup) {
      const { label, children: items } = child.props as React.ComponentProps<
        typeof ApprovalQueueGroup
      >;
      return <ListSection label={label}>{lower(items, list)}</ListSection>;
    }
    if (child.type === ApprovalQueueList) {
      Object.assign(list, child.props);
      return lower(list.children, list);
    }
    if (child.type === ApprovalQueueHeader) {
      const { title, count, actions } = child.props as React.ComponentProps<
        typeof ApprovalQueueHeader
      >;
      return <ListHeader title={title} count={count} action={actions} />;
    }
    if (child.type === ApprovalQueueFooter)
      return (
        <ListFooter>
          {(child.props as React.ComponentProps<typeof ApprovalQueueFooter>).children}
        </ListFooter>
      );
    return child;
  });
}

const loadingRow = (index: number): ListRowProps => ({
  value: `loading-${index}`,
  label: "",
  media: <Skeleton width="var(--v4-size-control-lg)" height="var(--v4-size-control-lg)" />,
  title: (
    <span className={styles.queueTitleLine}>
      <Skeleton width="calc(3 * var(--v4-size-cell-min))" />
    </span>
  ),
  meta: <Skeleton width="var(--v4-space-24)" />,
  children: (
    <span className={styles.queueSmallLine}>
      <Skeleton width="70%" />
    </span>
  ),
  actions: (
    <>
      <Skeleton
        width="calc(1.5 * var(--v4-size-cell-min))"
        height="var(--v4-size-control-default)"
      />
      <Skeleton
        width="calc(1.25 * var(--v4-size-cell-min))"
        height="var(--v4-size-control-default)"
      />
    </>
  )
});

const keepsWhileLoading = (node: React.ReactNode) =>
  React.isValidElement(node) && (node.type === ListHeader || node.type === ListFooter);

export type ApprovalQueueProps = {
  variant?: ApprovalQueueVariant;
  /** Replaces the requests with skeleton items in the same geometry while the queue loads; the header and footer stay. */
  loading?: boolean;
  loadingRows?: number;
  /** Announced while loading, naming what loads, such as Loading change requests. */
  loadingLabel?: string;
} & (
  | {
      requests: readonly ApprovalRequest[];
      current?: string;
      onApprove: (id: string) => void;
      onView?: (id: string) => void;
      onUndo?: (id: string) => void;
      onRetry: (id: string) => void;
      historyHref?: string;
      children?: never;
    }
  | { children: React.ReactNode; requests?: never }
);

export function ApprovalQueue({
  variant,
  loading = false,
  loadingRows = 3,
  loadingLabel = "Loading requests",
  ...props
}: ApprovalQueueProps) {
  let children: React.ReactNode = props.children;
  if (props.requests) {
    const { requests, current, onApprove, onView, onUndo, onRetry, historyHref } = props;
    children = (
      <>
        <ApprovalQueueHeader
          title="Needs you"
          count={
            loading
              ? undefined
              : `${requests.filter((request) => request.state !== "resolved").length} waiting`
          }
        />
        <ApprovalQueueList>
          {requests.map((request) => (
            <ApprovalQueueItem
              key={request.id}
              request={request}
              current={request.id === current}
              onApprove={onApprove}
              onView={onView}
              onUndo={onUndo}
              onRetry={onRetry}
            />
          ))}
        </ApprovalQueueList>
        {historyHref && (
          <ApprovalQueueFooter>
            <Button variant="link" size="sm" asChild>
              <a href={historyHref}>View history</a>
            </Button>
          </ApprovalQueueFooter>
        )}
      </>
    );
  }
  const list: React.ComponentProps<typeof ApprovalQueueList> = {};
  const lowered = lower(children, list);
  const content = loading
    ? [
        ...React.Children.toArray(lowered).filter(keepsWhileLoading),
        ...Array.from({ length: Math.max(1, Math.floor(loadingRows)) }, (_, index) => (
          <ListRow key={`loading-${index}`} {...loadingRow(index)} />
        ))
      ]
    : lowered;
  return (
    <div
      data-slot="approval-queue"
      data-variant={variant ?? "framed"}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
    >
      {loading && (
        <span className="sr-only" role="status">
          {loadingLabel}
        </span>
      )}
      <List
        label={list.label ?? "Requests waiting on you"}
        variant={variant}
        actionsPlacement="below"
        empty={list.empty ?? "Nothing is waiting on you."}
      >
        {content}
      </List>
    </div>
  );
}
