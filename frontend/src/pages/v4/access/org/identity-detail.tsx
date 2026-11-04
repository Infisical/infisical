import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { DetailLayout, Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";
import { Switch } from "@app/components/v4/ui/switch";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type { IdentityMembershipOrg } from "@app/hooks/api/identities/types";
import { OrgAccessControlTabSections } from "@app/types/org";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { formatDateTime, orgRoleName, orgRoleSlug, roleOptions } from "../roles";
import { failed, saved, toast } from "../toast";
import { AccessRestricted, Gate, RESTRICTED } from "../ui";
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
import { CopyButton, Dash, MetadataBadges, Section, Value } from "./detail-parts";
import { lastUsedLabel } from "./identities";
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
  const [role, setRole] = useState(
    orgRoleSlug(roles, { role: membership.role, roleId: membership.customRole?.id })
  );
  const [protectedFlag, setProtected] = useState(identity.hasDeleteProtection);
  const [metadata, setMetadata] = useState<MetadataEntry[]>(
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
          <DialogDescription>
            Update the identity&apos;s name, role, and metadata.
          </DialogDescription>
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
                onChange={setRole}
              />
            </Field>
            <Switch
              layout="row"
              label="Delete protection"
              description="Prevents this identity from being deleted while enabled."
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

const BackLink = ({ orgId }: { orgId: string }) => (
  <span className={css.start}>
    <Button variant="ghost" size="sm" icon="chev-left" asChild>
      <a href={backHref(orgId)}>Organization machine identities</a>
    </Button>
  </span>
);

export const OrgIdentityDetail = () => {
  const { identityId } = useParams({ from: "/v4/organizations/$orgId/identities/$identityId" });
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const { permission, isPending: permissionPending } = useOrgPermission();
  const { data: membership, isPending } = access.useOrgIdentity(identityId);
  const { data: roles } = access.useOrgRoles(orgId);
  const deleteIdentity = access.useDeleteOrgIdentity();
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
        description="It may have been deleted, or you may not have access to it."
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
  const isOwnIdentity = identity.orgId === orgId;
  const allConfigured = AUTH_METHOD_ORDER.every((method) => methods.includes(method));
  const roleRef = { role: membership.role, roleId: membership.customRole?.id };
  const deleteBlocked = identity.hasDeleteProtection;

  const addAuthButton = (variant: "outline" | "primary") => (
    <Gate allowed={canEditAuth}>
      <Button
        variant={variant}
        size="sm"
        icon="plus"
        disabled={!canEditAuth}
        onClick={() => setAuthForm({})}
      >
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
        icon: PencilIcon,
        disabledReason: (method) => {
          if (!canEditAuth) return RESTRICTED;
          return method === IdentityAuthMethod.UNIVERSAL_AUTH
            ? undefined
            : "Only Universal Auth can be edited from this page";
        },
        onSelect: (method) => setAuthForm({ method })
      }
    ],
    renderMenu: (method) => (
      <>
        <DropdownMenuItem onSelect={() => setAuthView(method)}>
          <Icon name="eye" />
          View auth method
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
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
        <Stack gap={8}>
          <BackLink orgId={orgId} />
          <PageHeader
            title={identity.name}
            mono
            description={
              isOwnIdentity
                ? "Configure and manage machine identity and organization access control"
                : "Configure and manage organization access control"
            }
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
                      navigator.clipboard?.writeText(identity.id);
                      toast({ tone: "neutral", title: "Machine identity ID copied to clipboard" });
                    }}
                  >
                    <Icon name="copy" />
                    Copy machine identity ID
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!canDelete || deleteBlocked}
                    onSelect={() => setDeleting(true)}
                  >
                    <Icon name="trash" />
                    {deleteBlocked
                      ? "Delete is blocked by delete protection"
                      : "Delete machine identity"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        </Stack>
        <DetailLayout
          asideLabel="Details"
          aside={
            <Card
              title="Details"
              description="Machine identity details"
              action={
                <Gate allowed={canEdit}>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label="Edit machine identity"
                    disabled={!canEdit}
                    onClick={() => setEditing(true)}
                  >
                    <Icon icon={PencilIcon} size={12} />
                  </Button>
                </Gate>
              }
            >
              <DataList
                variant="props"
                density="compact"
                items={[
                  ["Name", identity.name],
                  [
                    "ID",
                    <Value key="id" mono>
                      {identity.id}
                      <CopyButton
                        value={identity.id}
                        label="Copy machine identity ID to clipboard"
                      />
                    </Value>
                  ],
                  [
                    "Managed by",
                    <Badge key="managed" tone="outline">
                      <Icon name="building" size={12} />
                      Organization
                    </Badge>,
                    { span: "half" }
                  ],
                  ["Organization role", orgRoleName(roles, roleRef), { span: "half" }],
                  ["Created", formatDateTime(membership.createdAt), { span: "half" }],
                  [
                    "Delete protection",
                    identity.hasDeleteProtection ? (
                      <Badge key="protection" tone="ok">
                        <Icon name="check" size={12} />
                        Enabled
                      </Badge>
                    ) : (
                      <Badge key="protection" tone="outline">
                        <Icon name="x" size={12} />
                        Disabled
                      </Badge>
                    ),
                    { span: "half" }
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
            <Section
              title="Authentication"
              description="Configure authentication methods"
              action={
                isOwnIdentity && methods.length > 0 && !allConfigured
                  ? addAuthButton("outline")
                  : undefined
              }
            >
              {isOwnIdentity ? (
                <DataTable
                  label={`Auth methods for ${identity.name}`}
                  rows={methods}
                  columns={authColumns}
                  rowActions={authActions}
                  getRowId={(method) => method}
                  rowLabel={(method) => authMethodName(method)}
                  onRowActivate={setAuthView}
                  empty={
                    <EmptyState
                      size="sm"
                      icon="lock"
                      title="This machine identity has no auth methods configured"
                      description="Add an auth method to use this machine identity"
                      actions={addAuthButton("primary")}
                    />
                  }
                />
              ) : (
                <EmptyState
                  size="sm"
                  icon="building"
                  title="Machine identity managed by organization"
                  description="This machine identity's authentication methods are managed by your organization."
                  actions={
                    <Button variant="outline" asChild>
                      <a href={accessLinks.orgIdentity(identity.orgId, identity.id)}>
                        Go to organization access control
                      </a>
                    </Button>
                  }
                />
              )}
            </Section>
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
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Are you sure you want to delete ${identity.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                setDeleting(false);
                try {
                  await deleteIdentity.mutateAsync({ identityId: identity.id, orgId });
                  saved("Successfully deleted machine identity");
                  go(backHref(orgId));
                } catch (error) {
                  failed("Failed to delete machine identity", error);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
