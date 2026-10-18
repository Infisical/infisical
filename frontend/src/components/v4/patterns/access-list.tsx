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
  onAdd?: () => void;
  onRevoke: (ids: string[]) => void;
  onRestore?: (ids: string[]) => void;
  onChangeRole?: (id: string) => void;
};

export const AccessList = ({
  project,
  members,
  current,
  onAdd,
  onRevoke,
  onRestore,
  onChangeRole
}: AccessListProps) => {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [revoked, setRevoked] = React.useState<string[]>([]);
  const revoke = (ids: string[]) => {
    onRevoke(ids);
    setRevoked(ids);
    setSelected((value) => value.filter((id) => !ids.includes(id)));
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
          onSelectionChange={setSelected}
          empty={<EmptyState variant="compact" icon="user" title="Nobody else has access yet" />}
          footer={
            revoked.length > 0 ? (
              <span className={styles.statusLine}>
                Revoked access for {revoked.length} {revoked.length === 1 ? "member" : "members"}.
                {onRestore && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      onRestore(revoked);
                      setRevoked([]);
                    }}
                  >
                    Undo
                  </Button>
                )}
              </span>
            ) : undefined
          }
        >
          {members.map((member) => (
            <ListRow
              key={member.id}
              value={member.id}
              label={member.name}
              href={member.href}
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
          onClear={() => setSelected([])}
          actions={[
            { label: "Revoke access", icon: "trash", danger: true, onClick: () => revoke(selected) }
          ]}
        />
      </div>
    </div>
  );
};
