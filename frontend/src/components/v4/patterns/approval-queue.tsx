import * as React from "react";

import { Button } from "../ui/button";
import { Media } from "../ui/item";
import { List, ListRow, type ListRowProps, ListSection } from "../ui/list";

import frame from "../ui/frame.module.css";
import styles from "./approval-queue.module.css";

interface ApprovalRequestBase {
  id: string;
  object: string;
  title: React.ReactNode;
  description: React.ReactNode;
  age: string;
  href?: string;
}
export type ApprovalRequest = ApprovalRequestBase &
  (
    | { state: "new" | "pending" | "resolved"; error?: never }
    | { state: "failed"; error: React.ReactNode }
  );

export type ApprovalQueueVariant = "framed" | "segmented" | "divided";

const VariantContext = React.createContext<ApprovalQueueVariant>("framed");

export type ApprovalQueueProps = {
  variant?: ApprovalQueueVariant;
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

export function ApprovalQueueHeader({
  title,
  count,
  actions
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  if (React.use(VariantContext) === "framed")
    return (
      <div className={frame.frameHead}>
        <div className={frame.frameTitle}>{title}</div>
        {(count || actions) && (
          <div className={frame.frameAction}>
            {count}
            {actions}
          </div>
        )}
      </div>
    );
  return (
    <div className={styles.header}>
      <div className={styles.title}>{title}</div>
      {count && <div className={styles.count}>{count}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

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
        <Button variant="primary" size="sm" loading={pending} onClick={() => onApprove(request.id)}>
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

export function ApprovalQueueGroup({
  label,
  children
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return <ListSection label={label}>{children}</ListSection>;
}

// List finds its rows by element type, so items and groups are lowered to ListRow and ListSection before it sees them.
function lower(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (child.type === ApprovalQueueItem)
      return <ListRow {...itemRow(child.props as ApprovalQueueItemProps)} />;
    if (child.type === ApprovalQueueGroup) {
      const { label, children: items } = child.props as React.ComponentProps<
        typeof ApprovalQueueGroup
      >;
      return <ListSection label={label}>{lower(items)}</ListSection>;
    }
    return child;
  });
}

export function ApprovalQueueList({
  label = "Requests waiting on you",
  empty = "Nothing is waiting on you.",
  children
}: {
  label?: string;
  empty?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const variant = React.use(VariantContext);
  const list = (
    <List
      label={label}
      variant={variant === "segmented" ? "segmented" : "divided"}
      actionsPlacement="below"
      empty={empty}
    >
      {lower(children)}
    </List>
  );
  return variant === "framed" ? <div className={frame.frameInset}>{list}</div> : list;
}

export function ApprovalQueueFooter({ children }: { children: React.ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}

export function ApprovalQueue({ variant = "framed", ...props }: ApprovalQueueProps) {
  let children: React.ReactNode = props.children;
  if (props.requests) {
    const { requests, current, onApprove, onView, onUndo, onRetry, historyHref } = props;
    children = (
      <>
        <ApprovalQueueHeader
          title="Needs you"
          count={`${requests.filter((request) => request.state !== "resolved").length} waiting`}
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
  return (
    <VariantContext value={variant}>
      <div
        data-slot="approval-queue"
        data-variant={variant}
        className={variant === "framed" ? frame.frame : styles.queue}
      >
        {children}
      </div>
    </VariantContext>
  );
}
