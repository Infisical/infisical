import * as React from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { EmptyState } from "../ui/empty";
import { FloatingActionBar } from "../ui/floating-action-bar";
import { List, ListRow } from "../ui/list";
import { toast } from "../ui/sonner";

import styles from "./patterns.module.css";

export interface AccessMember {
  id: string;
  name: string;
  kind?: "person" | "machine" | "agent";
  role: string;
  via: React.ReactNode;
  lastUsed?: React.ReactNode;
  href?: string;
  owner?: boolean;
}

export type AccessListProps = {
  project: string;
  members: readonly AccessMember[];
  current?: string;
  onOpen?: (id: string) => void;
  onAdd?: () => void;
  onRevoke: (ids: string[]) => void | Promise<unknown>;
  onRestore?: (ids: string[]) => void | Promise<unknown>;
  onChangeRole?: (id: string) => void;
};

const UNDO_WINDOW_MS = 10_000;
const plural = (count: number) => `${count} ${count === 1 ? "member" : "members"}`;

export const AccessList = ({
  project,
  members,
  current,
  onOpen,
  onAdd,
  onRevoke,
  onRestore,
  onChangeRole
}: AccessListProps) => {
  const [picked, setPicked] = React.useState<string[]>([]);
  const stage = React.useRef<HTMLDivElement | null>(null);
  const refocus = React.useRef<{ revoked: string[]; next: string | null } | null>(null);
  const selectable = new Set(members.filter((member) => !member.owner).map((member) => member.id));
  const selected = picked.filter((id) => selectable.has(id));
  React.useEffect(() => {
    const pending = refocus.current;
    if (!pending || members.some((member) => pending.revoked.includes(member.id))) return;
    refocus.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const row =
      pending.next &&
      stage.current?.querySelector<HTMLElement>(
        `[data-list-row="${CSS.escape(pending.next)}"] [data-list-target]`
      );
    (row || stage.current?.querySelector<HTMLElement>("ul[aria-label]"))?.focus();
  });
  const restore = async (ids: string[]) => {
    if (!onRestore) return;
    try {
      await onRestore(ids);
      toast.success(`Restored access for ${plural(ids.length)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Access was not restored. Try again.");
    }
  };
  const revoke = async (ids: string[]) => {
    const targets = ids.filter((id) => selectable.has(id));
    if (!targets.length) return;
    const first = members.findIndex((member) => targets.includes(member.id));
    const kept = (member: AccessMember) => !targets.includes(member.id);
    try {
      await onRevoke(targets);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Access was not revoked. Try again.");
      return;
    }
    refocus.current = {
      revoked: targets,
      next:
        (members.slice(first).find(kept) ?? members.slice(0, first).reverse().find(kept))?.id ??
        null
    };
    setPicked((value) => value.filter((id) => !targets.includes(id)));
    toast.success(`Revoked access for ${plural(targets.length)}`, {
      duration: UNDO_WINDOW_MS,
      action: onRestore && { label: "Undo", onClick: () => restore(targets) }
    });
  };
  return (
    <div data-slot="access-list" className={styles.pattern}>
      <div className={styles.toolbar}>
        <p className={styles.toolbarText}>
          {members.length} with access to <code>{project}</code>
        </p>
        {onAdd && (
          <Button variant="outline" size="sm" icon="user-plus" onClick={onAdd}>
            Add member
          </Button>
        )}
      </div>
      <div ref={stage} className={styles.stage}>
        <List
          label="Members"
          title="Members"
          selection="multiple"
          selectedIds={selected}
          onSelectionChange={setPicked}
          empty={
            <EmptyState size="sm" media="bare" icon="user" title="Nobody else has access yet" />
          }
        >
          {members.map((member) => (
            <ListRow
              key={member.id}
              value={member.id}
              label={member.name}
              href={member.href}
              onClick={() => onOpen?.(member.id)}
              current={member.id === current}
              selectable={!member.owner}
              title={member.name}
              badge={<Badge>{member.role}</Badge>}
              description={member.via}
              meta={member.lastUsed}
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      icon="more"
                      iconOnly
                      disabled={member.owner}
                    >
                      {`Actions for ${member.name}`}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onChangeRole && (
                      <DropdownMenuItem onSelect={() => onChangeRole(member.id)}>
                        Change role
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onSelect={() => revoke([member.id])}>
                      Revoke access
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))}
        </List>
        <FloatingActionBar
          label="Member actions"
          count={selected.length}
          onClear={() => setPicked([])}
          actions={[
            { label: "Revoke access", icon: "trash", danger: true, onClick: () => revoke(selected) }
          ]}
        />
      </div>
    </div>
  );
};
