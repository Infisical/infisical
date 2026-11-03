import { useState } from "react";
import { ShieldIcon } from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v4/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { DetailLayout, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useAccess } from "../context";
import { displayName, SELF_USER_ID } from "../model";
import { Gate, Muted, useCan } from "../ui";
import { AssumePrivilegesDialog, RemoveMemberDialog } from "./member-dialogs";
import { MemberRolesSection } from "./member-roles";

import styles from "./project.module.css";

const FOLDER_GRANTS = "Folder grants are not part of this preview";

const joinedFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const CopyValue = ({ value, what }: { value: string; what: string }) => {
  const [copied, setCopied] = useState(false);
  const label = copied ? `${what} copied` : `Copy ${what.toLowerCase()} to clipboard`;
  return (
    <span className={styles.copyValue}>
      <span className={styles.wrap}>{value}</span>
      <Tooltip content={label}>
        <Button
          variant="ghost"
          size="icon-xs"
          icon={copied ? "check" : "copy"}
          iconOnly
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => undefined);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }}
        >
          {label}
        </Button>
      </Tooltip>
    </span>
  );
};

export const ProjectMemberDetail = ({ id }: { id: string }) => {
  const { data, update, saved, toast, navigate, startsWith } = useAccess();
  const can = useCan("project");
  const [auditOpen, setAuditOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [assuming, setAssuming] = useState(false);
  const member = data.projectMembers.find((item) => item.id === id);
  const user = data.orgMembers.find((item) => item.user.id === member?.userId)?.user;
  const back = () => navigate({ scope: "project", projectTab: "members" });

  if (!member || !user)
    return (
      <EmptyState
        title="User not found"
        description="This membership may have been removed or is no longer available."
      />
    );

  const isSelf = user.id === SELF_USER_ID;
  const name = displayName(user) ?? user.email;

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[{ label: "Project users", onClick: back }]}
        title={name}
        description="Configure and manage project access control"
        actions={
          <div className={styles.inline}>
            <Button variant="outline" onClick={() => setAuditOpen(true)}>
              <Icon icon={ShieldIcon} />
              Permission audit
            </Button>
            {isSelf ? (
              <Tooltip
                side="right"
                content="You cannot modify your own membership. Ask a project admin to make changes to your membership."
              >
                <Badge tone="info">
                  <Icon name="info" size={12} />
                  Your project membership
                </Badge>
              </Tooltip>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" iconRight="more">
                    Options
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      navigator.clipboard?.writeText(user.id).catch(() => undefined);
                      toast({ tone: "neutral", title: "User ID copied to clipboard" });
                    }}
                  >
                    <Icon name="copy" />
                    Copy user ID
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!can("member", "edit")}
                    onSelect={() => setAssuming(true)}
                  >
                    <Icon name="user" />
                    Assume privileges
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!can("member", "delete")}
                    onSelect={() => setRemoving(true)}
                  >
                    <Icon name="trash" />
                    Remove user from project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />
      <DetailLayout
        asideLabel="Details"
        aside={
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>User membership details</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className={styles.details}>
                <div>
                  <dt>Name</dt>
                  <dd>{displayName(user) ?? <Muted>-</Muted>}</dd>
                </div>
                <div>
                  <dt>ID</dt>
                  <dd>
                    <CopyValue value={user.id} what="User ID" />
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>
                    <CopyValue value={user.email} what="User email" />
                  </dd>
                </div>
                {user.username !== user.email && (
                  <div>
                    <dt>Username</dt>
                    <dd>{user.username}</dd>
                  </div>
                )}
                <div>
                  <dt>Joined project</dt>
                  <dd>{joinedFormat.format(new Date(member.createdAt))}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        }
      >
        <Stack gap={16}>
          <MemberRolesSection
            member={member}
            isSelf={isSelf}
            initialSheet={startsWith("edit-roles")}
          />
          <Card>
            <CardHeader>
              <CardTitle>Folder access</CardTitle>
              <CardDescription>
                Folder-level access for this user. Overrides their project roles within each folder.
              </CardDescription>
              <CardAction>
                <Gate allowed={false} reason={FOLDER_GRANTS}>
                  <Button variant="outline" size="xs" icon="plus" disabled>
                    Grant access
                  </Button>
                </Gate>
              </CardAction>
            </CardHeader>
            <CardContent>
              <EmptyState
                size="sm"
                icon="folder"
                title="This user has no folder access"
                description="Grant access to a folder to override their project roles within it"
                actions={
                  <Gate allowed={false} reason={FOLDER_GRANTS}>
                    <Button variant="outline" size="xs" icon="plus" disabled>
                      Grant access
                    </Button>
                  </Gate>
                }
              />
            </CardContent>
          </Card>
        </Stack>
      </DetailLayout>
      <RemoveMemberDialog
        name={removing ? name : undefined}
        onOpenChange={(next) => !next && setRemoving(false)}
        onConfirm={() => {
          update((current) => ({
            ...current,
            projectMembers: current.projectMembers.filter((item) => item.id !== member.id)
          }));
          saved("Successfully removed user from project");
          back();
        }}
      />
      <AssumePrivilegesDialog open={assuming} onOpenChange={setAssuming} />
      <Sheet open={auditOpen} onOpenChange={setAuditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Permission audit</SheetTitle>
            <SheetDescription>{`Review effective access for ${name}`}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <EmptyState
              size="sm"
              icon="lock"
              title="No effective permission data"
              description="This preview has no permission sources to audit. The audit reads them from the server."
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </Stack>
  );
};
