import { useState } from "react";
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
import { DetailLayout, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";
import { Switch } from "@app/components/v4/ui/switch";

import { useAccess } from "../context";
import { type AuthMethod, authMethodNames, type OrgIdentity, roleName } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, useCan } from "../ui";
import {
  AUTH_METHOD_ORDER,
  AuthMethodFormSheet,
  AuthMethodViewSheet,
  LockBadge,
  lockedMethods,
  RemoveAuthMethodDialog
} from "./auth-methods";
import { roleOptions } from "./create-identity-sheet";
import { BackButton, CopyButton, Dash, MetadataBadges, Section, Value } from "./detail-parts";
import { reapIdentity } from "./memberships";
import { type MetadataEntry, MetadataEditor, metadataErrors } from "./metadata-editor";
import { ProjectMembershipsSection } from "./project-memberships";

import css from "./org.module.css";

const EditIdentityDialog = ({
  identity,
  open,
  onOpenChange
}: {
  identity: OrgIdentity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, update, saved } = useAccess();
  const [name, setName] = useState(identity.name);
  const [role, setRole] = useState(identity.role);
  const [protectedFlag, setProtected] = useState(identity.hasDeleteProtection);
  const [metadata, setMetadata] = useState<MetadataEntry[]>(identity.metadata);
  const [errors, setErrors] = useState<{
    name?: string;
    metadata?: { key?: string; value?: string }[];
  }>({});
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            const metaErrors = metadataErrors(metadata);
            const next = { name: name.trim() ? undefined : "Required", metadata: metaErrors };
            setErrors(next);
            if (next.name || metaErrors.some((e) => e.key || e.value)) return;
            update((current) => ({
              ...current,
              orgIdentities: current.orgIdentities.map((item) =>
                item.id === identity.id
                  ? {
                      ...item,
                      name: name.trim(),
                      role,
                      hasDeleteProtection: protectedFlag,
                      metadata: metadata.map((m) => ({ key: m.key.trim(), value: m.value.trim() }))
                    }
                  : item
              )
            }));
            saved("Successfully updated machine identity");
            onOpenChange(false);
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
                options={roleOptions(data.orgRoles)}
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
          <Button variant="primary" type="submit" form="update-org-identity">
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const OrgIdentityDetail = ({ id }: { id: string }) => {
  const { data, update, saved, toast, navigate } = useAccess();
  const can = useCan("org");
  const identity = data.orgIdentities.find((item) => item.id === id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [authForm, setAuthForm] = useState<{ method?: AuthMethod }>();
  const [authView, setAuthView] = useState<AuthMethod>();
  const [removingAuth, setRemovingAuth] = useState<AuthMethod>();
  const back = () => navigate({ orgTab: "identities" });

  if (!identity)
    return (
      <EmptyState
        icon="machine"
        title="Machine identity not found"
        description="It may have been deleted in this preview."
        actions={
          <Button variant="outline" onClick={back}>
            Back to machine identities
          </Button>
        }
      />
    );

  const locked = lockedMethods(identity);
  const canEdit = can("identity", "edit");
  const allConfigured = AUTH_METHOD_ORDER.every((m) => identity.authMethods.includes(m));
  const addAuthButton = (variant: "outline" | "primary") => (
    <Gate allowed={canEdit}>
      <Button
        variant={variant}
        size="sm"
        icon="plus"
        disabled={!canEdit}
        onClick={() => setAuthForm({})}
      >
        Add auth method
      </Button>
    </Gate>
  );

  const authColumns: AccessColumn<AuthMethod>[] = [
    {
      id: "method",
      header: "Auth method",
      render: (method) => (
        <>
          <span>{authMethodNames[method]}</span>
          {locked.includes(method) && <LockBadge label="Auth method has active lockouts" />}
        </>
      )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (method) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              Auth method actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setAuthView(method)}>
              <Icon name="eye" />
              View auth method
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canEdit} onSelect={() => setAuthForm({ method })}>
              <Icon icon={PencilIcon} />
              Edit auth method
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!can("identity", "delete")}
              onSelect={() => setRemovingAuth(method)}
            >
              <Icon name="trash" />
              Remove auth method
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div className={css.detailPage}>
      <Stack gap={24}>
        <Stack gap={8}>
          <BackButton label="Organization machine identities" onClick={back} />
          <PageHeader
            title={identity.name}
            mono
            description="Configure and manage machine identity and organization access control"
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
                    disabled={!can("identity", "delete")}
                    onSelect={() => setDeleting(true)}
                  >
                    <Icon name="trash" />
                    Delete machine identity
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
                    </Badge>
                  ],
                  ["Organization role", roleName(data.orgRoles, identity.role)],
                  ["Metadata", <MetadataBadges key="metadata" items={identity.metadata} />],
                  ["Created", identity.createdAt],
                  [
                    "Last login method",
                    identity.lastLogin && identity.authMethods.length ? (
                      authMethodNames[identity.authMethods[0]]
                    ) : (
                      <Dash key="method" />
                    )
                  ],
                  ["Last logged in", identity.lastLogin ?? <Dash key="login" />],
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
                    )
                  ]
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
                identity.authMethods.length > 0 && !allConfigured
                  ? addAuthButton("outline")
                  : undefined
              }
            >
              <AccessTable
                label={`Auth methods for ${identity.name}`}
                rows={identity.authMethods}
                columns={authColumns}
                getRowId={(method) => method}
                rowLabel={(method) => authMethodNames[method]}
                onRowClick={setAuthView}
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
      {editing && <EditIdentityDialog identity={identity} open onOpenChange={setEditing} />}
      {authForm && (
        <AuthMethodFormSheet
          key={authForm.method ?? "new"}
          identity={identity}
          method={authForm.method}
          open
          onOpenChange={(open) => !open && setAuthForm(undefined)}
        />
      )}
      {authView && (
        <AuthMethodViewSheet
          identity={identity}
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
        identity={identity}
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
              onClick={() => {
                setDeleting(false);
                if (identity.hasDeleteProtection) {
                  toast({
                    tone: "bad",
                    title: "Failed to delete machine identity",
                    description:
                      "Delete protection is enabled for this machine identity. Turn it off before deleting it."
                  });
                  return;
                }
                update((current) => reapIdentity(current, identity.id));
                saved("Successfully deleted machine identity");
                back();
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
