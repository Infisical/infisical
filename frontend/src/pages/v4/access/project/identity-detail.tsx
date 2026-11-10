import { type MouseEvent, type ReactNode, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { BanIcon, PencilIcon, UserRoundXIcon } from "lucide-react";

import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { DetailLayout, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Switch } from "@app/components/v4/ui/switch";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { supportsAssumePrivileges } from "@app/helpers/project";
import type { Identity } from "@app/hooks/api/identities/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import { useV4Adapter } from "../../data/adapters";
import { PageLoader } from "../../shell/project-gate";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgPermission, useProjectPermission } from "../permissions";
import { AgentVaultIdentityDelegationSection } from "../product/agent-vault/delegation";
import { formatDateTime } from "../roles";
import { failed, saved, toast } from "../toast";
import { AccessRestricted, Gate, Muted } from "../ui";
import { ProjectIdentityAuthSection } from "./identity-auth";
import {
  AssumePrivilegesDialog,
  authMethodName,
  DELETE_PROTECTED,
  IdentityRemovalDialog,
  identitySubject,
  isProjectManaged,
  ManagedByBadge,
  type ProjectIdentityMembership
} from "./identity-common";
import { IdentityRoleDetailsSection } from "./identity-roles";
import { accessLabel, accessNoun } from "./product";
import { useProjectScope } from "./scope";

import styles from "./identity.module.css";

type MetadataDraft = { key: string; value: string; id: string };

const RouteLink = ({ href, children }: { href: string; children: ReactNode }) => {
  const go = useGo();
  return (
    <a
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        go(href);
      }}
    >
      {children}
    </a>
  );
};

const EditIdentityDialog = ({
  projectId,
  identity,
  open,
  onOpenChange
}: {
  projectId: string;
  identity: Identity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const update = useV4Adapter("access").useUpdateProjectManagedIdentity();
  const [name, setName] = useState(identity.name);
  const [protection, setProtection] = useState(identity.hasDeleteProtection);
  const [metadata, setMetadata] = useState<MetadataDraft[]>(() =>
    (identity.metadata ?? []).map((entry) => ({
      key: entry.key,
      value: entry.value,
      id: crypto.randomUUID()
    }))
  );
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const setEntry = (id: string, patch: Partial<MetadataDraft>) =>
    setMetadata((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  const invalid =
    !name.trim() || metadata.some((entry) => !entry.key.trim() || !entry.value.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Edit project identity</DialogTitle>
        </DialogHeader>
        <form
          id="edit-project-identity"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitted(true);
            if (invalid) return;
            setPending(true);
            try {
              await update.mutateAsync({
                projectId,
                identityId: identity.id,
                name: name.trim(),
                hasDeleteProtection: protection,
                metadata: metadata.map(({ key, value }) => ({
                  key: key.trim(),
                  value: value.trim()
                }))
              });
              saved("Successfully updated machine identity");
              onOpenChange(false);
            } catch (error) {
              failed("Failed to update machine identity", error);
            } finally {
              setPending(false);
            }
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={submitted && !name.trim() ? "Required" : undefined}>
              <Input
                autoFocus
                placeholder="Machine 1"
                autoComplete="off"
                name="project-identity-name"
                value={name}
                invalid={submitted && !name.trim()}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Switch label="Delete protection" checked={protection} onChange={setProtection} />
            <Stack gap={8}>
              <span className={styles.sectionLabel}>Metadata</span>
              <div className={styles.metadataBox} data-empty={metadata.length ? undefined : ""}>
                {metadata.length === 0
                  ? "No metadata entries. Select add entry below to add one."
                  : metadata.map((entry, index) => (
                      <div key={entry.id} className={styles.metadataRow}>
                        <div className={styles.metadataField}>
                          <Field
                            label={index === 0 ? "Key" : undefined}
                            error={submitted && !entry.key.trim() ? "Required" : undefined}
                          >
                            <Input
                              aria-label="Key"
                              value={entry.key}
                              invalid={submitted && !entry.key.trim()}
                              onChange={(event) => setEntry(entry.id, { key: event.target.value })}
                            />
                          </Field>
                        </div>
                        <div className={styles.metadataField}>
                          <Field
                            label={index === 0 ? "Value" : undefined}
                            error={submitted && !entry.value.trim() ? "Required" : undefined}
                          >
                            <Input
                              aria-label="Value"
                              value={entry.value}
                              invalid={submitted && !entry.value.trim()}
                              onChange={(event) =>
                                setEntry(entry.id, { value: event.target.value })
                              }
                            />
                          </Field>
                        </div>
                        <div className={styles.metadataRemove}>
                          <Button
                            type="button"
                            variant="danger-ghost"
                            icon="trash"
                            iconOnly
                            onClick={() =>
                              setMetadata((current) =>
                                current.filter((item) => item.id !== entry.id)
                              )
                            }
                          >
                            Remove metadata entry
                          </Button>
                        </div>
                      </div>
                    ))}
              </div>
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  icon="plus"
                  onClick={() =>
                    setMetadata((current) => [
                      ...current,
                      { key: "", value: "", id: crypto.randomUUID() }
                    ])
                  }
                >
                  Add entry
                </Button>
              </div>
            </Stack>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-project-identity" loading={pending}>
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CopyIdButton = ({ id }: { id: string }) => {
  const [copied, setCopied] = useState(false);
  const label = copied ? "Machine identity ID copied" : "Copy machine identity ID";
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon-xs"
        icon={copied ? "check" : "copy"}
        iconOnly
        onClick={() => {
          navigator.clipboard?.writeText(id).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {label}
      </Button>
    </Tooltip>
  );
};

const DetailsCard = ({
  membership,
  canEdit,
  onEdit
}: {
  membership: ProjectIdentityMembership;
  canEdit: boolean;
  onEdit: () => void;
}) => {
  const scope = useProjectScope();
  const { identity } = membership;
  const isOrgIdentity = !isProjectManaged(identity);
  const metadata = identity.metadata ?? [];
  return (
    <Card
      variant="framed"
      title="Details"
      action={
        isOrgIdentity ? undefined : (
          <Gate allowed={canEdit}>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Edit machine identity"
              disabled={!canEdit}
              onClick={onEdit}
            >
              <Icon icon={PencilIcon} size={12} />
            </Button>
          </Gate>
        )
      }
    >
      <DataList
        variant="props"
        density="compact"
        items={[
          ["Name", identity.name],
          [
            "ID",
            <span key="id" className={styles.idValue}>
              <code>{identity.id}</code>
              <CopyIdButton id={identity.id} />
            </span>
          ],
          ["Managed by", <ManagedByBadge key="managed" identity={identity} />],
          [
            "Metadata",
            metadata.length ? (
              <span key="metadata" className={styles.pairs}>
                {metadata.map((entry) => (
                  <span key={entry.id} className={styles.pair}>
                    <Badge tone="soft" mono>
                      {entry.key}
                    </Badge>
                    <Badge tone="outline" mono>
                      {entry.value}
                    </Badge>
                  </span>
                ))}
              </span>
            ) : (
              <Muted key="metadata">-</Muted>
            )
          ],
          [
            isOrgIdentity ? `Joined ${accessNoun(scope.projectType)}` : "Created",
            formatDateTime(membership.createdAt)
          ],
          ...(isOrgIdentity
            ? []
            : ([
                [
                  "Last login method",
                  membership.lastLoginAuthMethod ? (
                    authMethodName(membership.lastLoginAuthMethod)
                  ) : (
                    <Muted key="method">-</Muted>
                  )
                ],
                [
                  "Last logged in",
                  membership.lastLoginTime ? (
                    formatDateTime(membership.lastLoginTime)
                  ) : (
                    <Muted key="login">-</Muted>
                  )
                ],
                [
                  "Delete protection",
                  identity.hasDeleteProtection ? (
                    <Badge key="protection" tone="ok">
                      <Icon name="check" size={12} />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge key="protection" tone="outline">
                      <Icon icon={BanIcon} size={12} />
                      Disabled
                    </Badge>
                  )
                ]
              ] as [string, ReactNode][]))
        ]}
      />
    </Card>
  );
};

const OrgManagedAuthCard = ({ identity }: { identity: Identity }) => {
  const { permission } = useOrgPermission();
  return (
    <Card variant="framed" title="Authentication">
      <Alert tone="info" title="Machine identity managed by organization">
        {permission.can(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity) ? (
          <>
            {"To make changes, "}
            <Button variant="link" asChild>
              <RouteLink href={accessLinks.orgIdentity(identity.orgId, identity.id)}>
                go to organization access control
              </RouteLink>
            </Button>
            .
          </>
        ) : (
          "Ask an organization admin to make changes."
        )}
      </Alert>
    </Card>
  );
};

export const ProjectIdentityDetail = () => {
  const scope = useProjectScope();
  const { orgId, projectId } = scope;
  const { identityId = "" } = useParams({ strict: false });
  const go = useGo();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const { data: membership, isPending } = useV4Adapter("access").useProjectIdentity(
    projectId,
    identityId,
    scope.projectType
  );
  const [editing, setEditing] = useState(false);
  const [assuming, setAssuming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const listHref = accessLinks.project(scope, ProjectAccessControlTabs.Identities);

  const backLink = (
    <div>
      <Button variant="link" icon="chev-left" asChild>
        <RouteLink
          href={listHref}
        >{`${accessLabel(scope.projectType, "machine identities")}`}</RouteLink>
      </Button>
    </div>
  );

  if (permissionPending || isPending) return <PageLoader label="Loading machine identity" />;

  if (!permission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity))
    return <AccessRestricted requirement="read Identity" />;

  if (!membership)
    return (
      <Stack gap={24}>
        {backLink}
        <EmptyState icon="search" title="Machine identity not found" />
      </Stack>
    );

  const { identity } = membership;
  const isProjectIdentity = isProjectManaged(identity);
  const deleteBlocked = isProjectIdentity && identity.hasDeleteProtection;
  const target = identitySubject(identity.id);
  const canEdit = permission.can(ProjectPermissionIdentityActions.Edit, target);
  const canDelete = permission.can(ProjectPermissionIdentityActions.Delete, target);
  const canAssume =
    supportsAssumePrivileges(scope.projectType) &&
    permission.can(ProjectPermissionIdentityActions.AssumePrivileges, target);

  return (
    <Stack gap={24}>
      <Stack gap={12}>
        {backLink}
        <PageHeader
          title={identity.name}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" iconRight="more">
                  Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(identity.id).catch(() => undefined);
                    toast({ tone: "neutral", title: "Machine identity ID copied to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy machine identity ID
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canAssume} onSelect={() => setAssuming(true)}>
                  <Icon name="user" />
                  Assume privileges
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete || deleteBlocked}
                  description={deleteBlocked ? DELETE_PROTECTED : undefined}
                  onSelect={() => setRemoving(true)}
                >
                  {isProjectIdentity ? <Icon name="trash" /> : <Icon icon={UserRoundXIcon} />}
                  {isProjectIdentity
                    ? "Delete machine identity"
                    : `Remove from ${accessNoun(scope.projectType)}`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </Stack>
      <DetailLayout
        asideLabel="Details"
        aside={
          <DetailsCard membership={membership} canEdit={canEdit} onEdit={() => setEditing(true)} />
        }
      >
        <Stack gap={24}>
          {isProjectIdentity ? (
            <ProjectIdentityAuthSection identity={identity} projectId={projectId} />
          ) : (
            <OrgManagedAuthCard identity={identity} />
          )}
          {scope.projectType === ProjectType.AgentVault ? (
            <AgentVaultIdentityDelegationSection
              machineIdentityId={identity.id}
              machineIdentityName={identity.name}
            />
          ) : (
            <IdentityRoleDetailsSection projectId={projectId} membership={membership} />
          )}
        </Stack>
      </DetailLayout>
      {editing && (
        <EditIdentityDialog
          projectId={projectId}
          identity={identity}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
      <AssumePrivilegesDialog
        orgId={orgId}
        projectId={projectId}
        identityId={assuming ? identity.id : undefined}
        onOpenChange={setAssuming}
      />
      <IdentityRemovalDialog
        projectId={projectId}
        identity={removing ? identity : undefined}
        from="detail"
        onOpenChange={setRemoving}
        onDone={() => go(listHref)}
      />
    </Stack>
  );
};
