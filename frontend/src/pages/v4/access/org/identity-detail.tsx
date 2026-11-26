import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { DetailLayout, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { useParams } from "@tanstack/react-router";

import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type { IdentityMembershipOrg } from "@app/hooks/api/identities/types";
import { OrgAccessControlTabSections } from "@app/types/org";

import { copyText } from "../../clipboard";
import { useV4Adapter } from "../../data/adapters";
import { TruncatedValue } from "../../networking/truncated-value";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { IdentityAlertAction } from "../project/identity-alerts";
import { formatDateTime, orgRoleName, orgRoleSlug, roleOptions } from "../roles";
import { failed, saved, toast } from "../toast";
import { AccessRestricted, EditDetailsButton, Gate, RESTRICTED } from "../ui";
import {
  AUTH_METHOD_ORDER,
  type AuthIdentity,
  AuthMethodFormSheet,
  AuthMethodViewSheet,
  authMethodName,
  LockBadge,
  RemoveAuthMethodDialog,
  sortedMethods
} from "./auth-methods";
import { Dash, MetadataBadges } from "./detail-parts";
import { DeleteIdentityLabel, lastUsedLabel, RemoveIdentityDialog } from "./identities";
import { type MetadataEntry, MetadataEditor, metadataErrors } from "./metadata-editor";
import { ProjectMembershipsSection } from "./project-memberships";

import css from "./org.module.css";

const EditIdentityDialog = ({
  membership,
  open,
  onOpenChange
}: {
  membership: IdentityMembershipOrg;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const updateIdentity = access.useUpdateOrgIdentity();
  const { identity } = membership;
  const [name, setName] = useState(identity.name);
  const [role, setRole] = useState(() =>
    orgRoleSlug(roles, { role: membership.role, roleId: membership.customRole?.id })
  );
  const [protectedFlag, setProtected] = useState(identity.hasDeleteProtection);
  const [metadata, setMetadata] = useState<MetadataEntry[]>(() =>
    membership.metadata.map(({ key, value }) => ({ key, value }))
  );
  const [errors, setErrors] = useState<{
    name?: string;
    metadata?: { key?: string; value?: string }[];
  }>({});
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const metaErrors = metadataErrors(metadata);
    const next = { name: name.trim() ? undefined : "Required", metadata: metaErrors };
    setErrors(next);
    if (next.name || metaErrors.some((entry) => entry.key || entry.value)) return;
    setPending(true);
    try {
      await updateIdentity.mutateAsync({
        identityId: identity.id,
        organizationId: orgId,
        name: name.trim(),
        role,
        hasDeleteProtection: protectedFlag,
        metadata: metadata.map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
      });
      saved("Successfully updated machine identity");
      onOpenChange(false);
    } catch (error) {
      failed("Failed to update machine identity", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Update machine identity</DialogTitle>
        </DialogHeader>
        <form
          id="update-org-identity"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={errors.name}>
              <Input
                autoComplete="off"
                placeholder="Machine 1"
                value={name}
                invalid={Boolean(errors.name)}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Update role">
              <Select
                label="Update role"
                value={role}
                options={roleOptions(roles)}
                descriptionLayout="stacked"
                onChange={setRole}
              />
            </Field>
            <Switch
              layout="row"
              label="Delete protection"
              checked={protectedFlag}
              onChange={setProtected}
            />
            <MetadataEditor
              boxed
              addLabel="Add entry"
              entries={metadata}
              errors={errors.metadata}
              onChange={setMetadata}
            />
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="update-org-identity" loading={pending}>
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const backHref = (orgId: string) => accessLinks.org(orgId, OrgAccessControlTabSections.Identities);

const IdentityHeaderActions = ({
  identity,
  owned,
  showAlerts,
  canEdit,
  canDelete,
  onDelete
}: {
  identity: { id: string; hasDeleteProtection: boolean };
  owned: boolean;
  showAlerts: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) => (
  <Inline gap={8} wrap={false}>
    {showAlerts && <IdentityAlertAction identityId={identity.id} canEdit={canEdit} />}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" iconRight="more">
          Options
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={async () => {
            if (await copyText(identity.id))
              toast({ tone: "neutral", title: "Machine identity ID copied to clipboard" });
          }}
        >
          <Icon name="copy" />
          Copy machine identity ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete || (owned && identity.hasDeleteProtection)}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={onDelete}
        >
          <Icon name="trash" />
          <DeleteIdentityLabel owned={owned} deleteProtected={identity.hasDeleteProtection} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </Inline>
);

export const OrgIdentityDetail = () => {
  const { identityId } = useParams({ from: "/v4/organizations/$orgId/identities/$identityId" });
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const { permission, isPending: permissionPending } = useOrgPermission();
  const { data: membership, isPending } = access.useOrgIdentity(identityId);
  const { data: roles } = access.useOrgRoles(orgId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [authForm, setAuthForm] = useState<{ method?: IdentityAuthMethod }>();
  const [authView, setAuthView] = useState<IdentityAuthMethod>();
  const [removingAuth, setRemovingAuth] = useState<IdentityAuthMethod>();
  const can = (action: OrgPermissionIdentityActions) =>
    permission.can(action, OrgPermissionSubjects.Identity);

  if (permissionPending || isPending)
    return <Loader size="page" label="Loading machine identity" />;
  if (!can(OrgPermissionIdentityActions.Read))
    return <AccessRestricted requirement="read Identity" />;
  if (!membership)
    return (
      <EmptyState
        icon="machine"
        title="Machine identity not found"
        actions={
          <Button variant="outline" asChild>
            <a href={backHref(orgId)}>Back to machine identities</a>
          </Button>
        }
      />
    );

  const { identity } = membership;
  const authIdentity: AuthIdentity = {
    id: identity.id,
    name: identity.name,
    authMethods: identity.authMethods,
    activeLockoutAuthMethods: identity.activeLockoutAuthMethods
  };
  const methods = sortedMethods(identity.authMethods);
  const locked = identity.activeLockoutAuthMethods ?? [];
  const canEdit = can(OrgPermissionIdentityActions.Edit);
  const canEditAuth = can(OrgPermissionIdentityActions.EditAuth);
  const canDelete = can(OrgPermissionIdentityActions.Delete);
  const canRevokeAuth = can(OrgPermissionIdentityActions.RevokeAuth);
  const isOwnIdentity = identity.orgId === orgId;
  const allConfigured = AUTH_METHOD_ORDER.every((method) => methods.includes(method));
  const roleRef = { role: membership.role, roleId: membership.customRole?.id };

  const addAuthButton = (
    <Gate allowed={canEditAuth}>
      <Button variant="accent" icon="plus" disabled={!canEditAuth} onClick={() => setAuthForm({})}>
        Add auth method
      </Button>
    </Gate>
  );

  const authColumns: DataTableColumn<IdentityAuthMethod>[] = [
    {
      id: "method",
      header: "Auth method",
      grow: true,
      render: (method) => (
        <Inline gap={8} wrap={false}>
          <Icon name="key" />
          <span>{authMethodName(method)}</span>
          {locked.includes(method) && <LockBadge label="Auth method has active lockouts" />}
        </Inline>
      )
    },
    {
      id: "lastUsed",
      header: "Last used",
      render: (method) =>
        membership.lastLoginAuthMethod === method && membership.lastLoginTime ? (
          <span>{lastUsedLabel(membership.lastLoginTime)}</span>
        ) : (
          <Dash />
        )
    }
  ];

  const authActions: DataTableRowActions<IdentityAuthMethod> = {
    inline: [
      {
        label: "Edit auth method",
        icon: "pencil",
        disabledReason: () => (canEditAuth ? undefined : RESTRICTED),
        onSelect: (method) => setAuthForm({ method })
      }
    ],
    renderMenu: (method) => (
      <>
        <DropdownMenuItem onSelect={() => setAuthView(method)}>
          <Icon name="eye" />
          View auth method
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canRevokeAuth}
          description={canRevokeAuth ? undefined : RESTRICTED}
          onSelect={() => setRemovingAuth(method)}
        >
          <Icon name="trash" />
          Remove auth method
        </DropdownMenuItem>
      </>
    )
  };

  return (
    <div className={css.detailPage}>
      <Stack gap={24}>
        <PageHeader
          breadcrumb={[
            { label: "Organization machine identities", link: go.link(backHref(orgId)) }
          ]}
          title={identity.name}
          actions={
            <IdentityHeaderActions
              identity={identity}
              owned={isOwnIdentity}
              showAlerts={isOwnIdentity && !identity.projectId}
              canEdit={canEdit}
              canDelete={canDelete}
              onDelete={() => setDeleting(true)}
            />
          }
        />
        <DetailLayout
          asideLabel="Details"
          aside={
            <Card
              variant="framed"
              title="Details"
              action={
                <EditDetailsButton
                  label="Edit machine identity"
                  allowed={canEdit}
                  onClick={() => setEditing(true)}
                />
              }
            >
              <DataList
                variant="props"
                density="compact"
                items={[
                  ["Name", identity.name],
                  [
                    "ID",
                    <TruncatedValue
                      key="id"
                      value={identity.id}
                      copyLabel="Copy machine identity ID to clipboard"
                    />
                  ],
                  [
                    "Managed by",
                    <Badge key="managed" tone="outline">
                      <Icon name="building" />
                      Organization
                    </Badge>
                  ],
                  ["Organization role", orgRoleName(roles, roleRef)],
                  ["Created", formatDateTime(membership.createdAt)],
                  [
                    "Delete protection",
                    identity.hasDeleteProtection ? (
                      <Badge key="protection" tone="ok">
                        <Icon name="check" />
                        Enabled
                      </Badge>
                    ) : (
                      <Badge key="protection" tone="outline">
                        <Icon name="x" />
                        Disabled
                      </Badge>
                    )
                  ],
                  [
                    "Last login",
                    membership.lastLoginTime && membership.lastLoginAuthMethod ? (
                      `${formatDateTime(membership.lastLoginTime)} with ${authMethodName(membership.lastLoginAuthMethod)}`
                    ) : (
                      <Dash key="login" />
                    )
                  ],
                  ["Metadata", <MetadataBadges key="metadata" items={membership.metadata} />]
                ]}
              />
            </Card>
          }
        >
          <div className={css.column}>
            <Card
              variant="framed"
              title="Authentication"
              action={isOwnIdentity && !allConfigured ? addAuthButton : undefined}
            >
              {isOwnIdentity && methods.length > 0 && (
                <DataTable
                  label={`Auth methods for ${identity.name}`}
                  rows={methods}
                  columns={authColumns}
                  rowActions={authActions}
                  getRowId={(method) => method}
                  rowLabel={(method) => authMethodName(method)}
                  onRowActivate={setAuthView}
                />
              )}
              {isOwnIdentity && !methods.length && (
                <EmptyState
                  size="sm"
                  icon="lock"
                  title="This machine identity has no auth methods configured"
                />
              )}
              {!isOwnIdentity && (
                <EmptyState
                  size="sm"
                  icon="building"
                  title="Machine identity managed by organization"
                  actions={
                    <Button variant="outline" asChild>
                      <a href={accessLinks.orgIdentity(identity.orgId, identity.id)}>
                        Go to organization access control
                      </a>
                    </Button>
                  }
                />
              )}
            </Card>
            <ProjectMembershipsSection
              subject="identity"
              subjectId={identity.id}
              subjectName={identity.name}
              canEdit={canEdit}
            />
          </div>
        </DetailLayout>
      </Stack>
      {editing && <EditIdentityDialog membership={membership} open onOpenChange={setEditing} />}
      {authForm && (
        <AuthMethodFormSheet
          key={authForm.method ?? "new"}
          identity={authIdentity}
          method={authForm.method}
          open
          onOpenChange={(open) => !open && setAuthForm(undefined)}
        />
      )}
      {authView && (
        <AuthMethodViewSheet
          identity={authIdentity}
          method={authView}
          open
          onOpenChange={(open) => !open && setAuthView(undefined)}
          onEdit={() => {
            setAuthForm({ method: authView });
            setAuthView(undefined);
          }}
          onRemove={() => {
            setRemovingAuth(authView);
            setAuthView(undefined);
          }}
        />
      )}
      <RemoveAuthMethodDialog
        identity={authIdentity}
        method={removingAuth}
        onClose={() => setRemovingAuth(undefined)}
      />
      <RemoveIdentityDialog
        identity={deleting ? identity : undefined}
        owned={isOwnIdentity}
        onClose={() => setDeleting(false)}
        onRemoved={() => go(backHref(orgId))}
      />
    </div>
  );
};
