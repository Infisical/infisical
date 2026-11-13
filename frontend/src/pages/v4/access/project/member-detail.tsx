import { useState } from "react";
import { subject } from "@casl/ability";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@infisical/cipher/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { ProjectAccessControlTabs } from "@app/types/project";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { PageLoader } from "../../shell/project-gate";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { formatDate } from "../roles";
import { failed, saved, toast } from "../toast";
import { AccessRestricted, Muted, RESTRICTED } from "../ui";
import { personName } from "./member-access";
import { type AssumeTarget, AssumePrivilegesDialog, RemoveMemberDialog } from "./member-dialogs";
import { MemberRolesSection } from "./member-roles";
import { accessLabel, accessNoun, canAssumeUserIn } from "./product";
import { useProjectScope } from "./scope";

import styles from "./project.module.css";

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

export const ProjectMemberDetail = () => {
  const scope = useProjectScope();
  const { orgId, projectId } = scope;
  const { membershipId = "" } = useParams({ strict: false });
  const access = useV4Adapter("access");
  const go = useGo();
  const session = useV4Session();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const query = access.useProjectUser(projectId, membershipId, scope.projectType);
  const removeUsers = access.useRemoveProjectUsers();
  const [removing, setRemoving] = useState(false);
  const [assuming, setAssuming] = useState<AssumeTarget>();
  const listHref = accessLinks.project(scope, ProjectAccessControlTabs.Member);
  const breadcrumb = [{ label: `${accessLabel(scope.projectType, "users")}`, href: listHref }];

  if (permissionPending || query.isPending) return <PageLoader label="Loading user" />;
  if (!permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member))
    return (
      <Stack gap={24}>
        <PageHeader breadcrumb={breadcrumb} title={`${accessLabel(scope.projectType, "user")}`} />
        <AccessRestricted requirement="read Member" />
      </Stack>
    );

  const member = query.data;
  if (!member)
    return (
      <Stack gap={24}>
        <PageHeader breadcrumb={breadcrumb} title={`${accessLabel(scope.projectType, "user")}`} />
        <EmptyState title="User not found" />
      </Stack>
    );

  const { user } = member;
  const isSelf = user.email === session.user.email;
  const name = personName(user) ?? user.email;
  const canAssume =
    canAssumeUserIn(scope.projectType) &&
    permission.can(
      ProjectPermissionMemberActions.AssumePrivileges,
      subject(ProjectPermissionSub.Member, { userEmail: user.email })
    );
  const canDelete = permission.can(
    ProjectPermissionMemberActions.Delete,
    ProjectPermissionSub.Member
  );

  const remove = async () => {
    setRemoving(false);
    try {
      await removeUsers.mutateAsync({
        orgId,
        usernames: [user.username],
        projectId,
        projectType: scope.projectType
      });
      saved(`Successfully removed user from ${accessNoun(scope.projectType)}`);
      go(listHref);
    } catch (error) {
      failed(`Failed to remove user from ${accessNoun(scope.projectType)}`, error);
    }
  };

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={breadcrumb}
        title={name}
        actions={
          isSelf ? (
            <Tooltip
              side="right"
              content="You cannot modify your own membership. Ask a project admin to make changes to your membership."
            >
              <Badge tone="info">
                <Icon name="info" size={12} />
                {`Your ${accessNoun(scope.projectType)} membership`}
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
                  disabled={!canAssume}
                  description={canAssume ? undefined : RESTRICTED}
                  onSelect={() => setAssuming({ id: user.id, type: ActorType.USER })}
                >
                  <Icon name="user" />
                  Assume privileges
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setRemoving(true)}
                >
                  <Icon name="trash" />
                  {`Remove user from ${accessNoun(scope.projectType)}`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
      <DetailLayout
        asideLabel="Details"
        aside={
          <Card variant="framed">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DataList
                variant="props"
                density="compact"
                items={[
                  ["Name", personName(user) ?? <Muted>-</Muted>],
                  ["ID", <CopyValue key="id" value={user.id} what="User ID" />],
                  ["Email", <CopyValue key="email" value={user.email} what="User email" />],
                  ...(user.username !== user.email ? ([["Username", user.username]] as const) : []),
                  [`Joined ${accessNoun(scope.projectType)}`, formatDate(member.createdAt)]
                ]}
              />
            </CardContent>
          </Card>
        }
      >
        <MemberRolesSection member={member} projectId={projectId} isSelf={isSelf} />
      </DetailLayout>
      <RemoveMemberDialog
        name={removing ? name : undefined}
        onOpenChange={(next) => !next && setRemoving(false)}
        onConfirm={remove}
      />
      <AssumePrivilegesDialog
        projectId={projectId}
        target={assuming}
        onOpenChange={(next) => !next && setAssuming(undefined)}
      />
    </Stack>
  );
};
