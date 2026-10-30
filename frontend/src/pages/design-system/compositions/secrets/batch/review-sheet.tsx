import { useState } from "react";
import { ClipboardCheckIcon } from "lucide-react";

import { Badge, Count } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";

import { readableValue } from "../../secrets-model";
import { type DiffViewItem, SecretVersionDiffView } from "../commits/diff-view";
import { type PendingChange, type PendingResource, pendingTarget } from "./pending";

import styles from "./batch.module.css";

const versionOf = (resource: PendingResource, version: number) =>
  resource.kind === "folder"
    ? { version, name: resource.name, description: resource.description }
    : {
        version,
        secretKey: resource.name,
        secretValue: readableValue(resource),
        secretValueHidden: readableValue(resource) === undefined,
        tags: resource.tags,
        secretMetadata: resource.metadata.map(({ key, value, encrypted }) => ({
          key,
          value,
          isEncrypted: encrypted
        })),
        skipMultilineEncoding: Boolean(resource.skipMultilineEncoding),
        comment: resource.comment
      };

const diffItem = (change: PendingChange): DiffViewItem => {
  const target = pendingTarget(change);
  return {
    id: change.id,
    type: target.kind === "folder" ? "folder" : "secret",
    ...(target.kind === "folder" ? { folderName: target.name } : { secretKey: target.name }),
    isAdded: change.type === "create",
    isUpdated: change.type === "update",
    isDeleted: change.type === "delete",
    versions: [change.original, change.next]
      .filter((resource): resource is PendingResource => Boolean(resource))
      .map((resource, index) => versionOf(resource, index + 1))
  };
};

export const commitLabel = (count: number) =>
  count === 1 ? "Save change" : `Commit ${count} changes`;

export function ReviewSheet({
  open,
  pending,
  onOpenChange,
  onDiscard,
  onCommit
}: {
  open: boolean;
  pending: readonly PendingChange[];
  onOpenChange: (open: boolean) => void;
  onDiscard: (change: PendingChange) => void;
  onCommit: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const single = pending.length === 1;
  const groups = [
    {
      label: "Folders",
      icon: <Icon name="folder" />,
      changes: pending.filter((change) => pendingTarget(change).kind === "folder")
    },
    {
      label: "Secrets",
      icon: <Icon name="key" />,
      changes: pending.filter((change) => pendingTarget(change).kind === "secret")
    }
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={styles.reviewSheet}>
        <SheetHeader>
          <SheetTitle>
            <span className={styles.titleLine}>
              Review changes
              <Badge tone="warn">
                <Icon icon={ClipboardCheckIcon} size={12} />
                {`${pending.length} change${single ? "" : "s"}`}
              </Badge>
            </span>
          </SheetTitle>
          <SheetDescription>
            {single
              ? "Review the change you're about to save."
              : "Write a commit message and review the changes you're about to commit."}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className={styles.groups}>
            {groups
              .filter((group) => group.changes.length)
              .map((group) => (
                <section key={group.label} className={styles.group}>
                  <div className={styles.groupHead}>
                    {group.icon}
                    <span className={styles.eyebrow}>{group.label}</span>
                    <Count tone="neutral">{group.changes.length}</Count>
                  </div>
                  <div className={styles.changes}>
                    {group.changes.map((change) => (
                      <SecretVersionDiffView
                        key={change.id}
                        item={diffItem(change)}
                        showViewed
                        onDiscard={() => onDiscard(change)}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        </SheetBody>
        <SheetFooter>
          <div className={styles.footer}>
            {!single && (
              <Field label="Commit message">
                <Input
                  autoFocus
                  value={message}
                  maxLength={255}
                  placeholder="Describe your changes..."
                  onChange={(event) => setMessage(event.target.value)}
                />
              </Field>
            )}
            <Inline gap={8} justify="end">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                icon="check"
                onClick={() => {
                  onCommit(message);
                  setMessage("");
                }}
              >
                {commitLabel(pending.length)}
              </Button>
            </Inline>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
