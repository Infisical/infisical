import * as React from "react";

import { Avatar } from "../ui/avatar";
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
  const [revoked, setRevoked] = React.useState<string[]>([]);
  const [failure, setFailure] = React.useState<string>();
  const status = React.useRef<HTMLSpanElement | null>(null);
  const selectable = new Set(members.filter((member) => !member.owner).map((member) => member.id));
  const selected = picked.filter((id) => selectable.has(id));
  const revoke = async (ids: string[]) => {
    const targets = ids.filter((id) => selectable.has(id));
    if (!targets.length) return;
    setFailure(undefined);
    status.current?.focus();
    try {
      await onRevoke(targets);
      setRevoked((value) => [...new Set([...value, ...targets])]);
      setPicked((value) => value.filter((id) => !targets.includes(id)));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Access was not revoked. Try again.");
    }
  };
  const restore = async () => {
    if (!onRestore) return;
    setFailure(undefined);
    try {
      await onRestore(revoked);
      setRevoked([]);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Access was not restored. Try again.");
    }
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
      <div className={styles.stage}>
        <List
          label="Members"
          title="Members"
          selection="multiple"
          selectedIds={selected}
          onSelectionChange={setPicked}
          empty={<EmptyState variant="compact" icon="user" title="Nobody else has access yet" />}
          footer={
            <span
              ref={status}
              tabIndex={-1}
              role="status"
              className={failure ? styles.failure : styles.statusLine}
            >
              {failure ??
                (revoked.length > 0 && (
                  <>
                    Revoked access for {revoked.length}{" "}
                    {revoked.length === 1 ? "member" : "members"}.
                    {onRestore && (
                      <Button variant="link" size="sm" onClick={restore}>
                        Undo
                      </Button>
                    )}
                  </>
                ))}
            </span>
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
              media={<Avatar size={32} name={member.name} kind={member.kind ?? "person"} />}
              title={
                member.kind && member.kind !== "person" ? <code>{member.name}</code> : member.name
              }
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
          placement="contained"
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
