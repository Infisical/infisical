import * as React from "react";

import { Button } from "../ui/button";
import { Media } from "../ui/item";
import { List, ListRow } from "../ui/list";

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

export type ApprovalQueueProps = {
  requests: readonly ApprovalRequest[];
  current?: string;
  onApprove: (id: string) => void;
  onView?: (id: string) => void;
  onUndo: (id: string) => void;
  onRetry: (id: string) => void;
  historyHref?: string;
};

export const ApprovalQueue = ({
  requests,
  current,
  onApprove,
  onView,
  onUndo,
  onRetry,
  historyHref
}: ApprovalQueueProps) => {
  const waiting = requests.filter((request) => request.state !== "resolved").length;
  return (
    <div data-slot="approval-queue">
      <List
        label="Requests waiting on you"
        title="Needs you"
        action={`${waiting} waiting`}
        actionsPlacement="below"
        empty="Nothing is waiting on you."
        footer={
          historyHref ? (
            <Button variant="link" size="sm" asChild>
              <a href={historyHref}>View history</a>
            </Button>
          ) : undefined
        }
      >
        {requests.map((request) => {
          const pending = request.state === "pending";
          let actions: React.ReactNode;
          if (request.state === "resolved")
            actions = (
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => onView(request.id)}
                  >
                    View diff
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  loading={pending}
                  onClick={() => onApprove(request.id)}
                >
                  Approve
                </Button>
              </>
            );
          return (
            <ListRow
              key={request.id}
              value={request.id}
              label={request.object}
              href={request.href}
              current={request.id === current}
              unread={request.state === "new"}
              resolved={request.state === "resolved"}
              media={
                <Media
                  icon={request.state === "failed" ? "alert" : "inbox"}
                  tone={request.state === "failed" ? "bad" : undefined}
                />
              }
              title={request.title}
              description={request.description}
              error={request.state === "failed" ? request.error : undefined}
              meta={request.age}
              actions={actions}
            />
          );
        })}
      </List>
    </div>
  );
};
