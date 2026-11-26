import { useEffect, useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isCustomOrgRole, OrgMembershipRole } from "@app/helpers/roles";
import type { IncidentContact } from "@app/hooks/api/incidentContacts/types";
import type { Organization } from "@app/hooks/api/organization/types";
import type { TOrgRole } from "@app/hooks/api/roles/types";
import { GenericResourceNameSchema, slugSchema } from "@app/lib/schemas";

import { useOrgPermission } from "../../access/permissions";
import { failed, saved as savedToast } from "../../access/toast";
import { AccessRestricted, ListToolbar, RESTRICTED } from "../../access/ui";
import { copyText } from "../../clipboard";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref } from "../../links";
import { OrgAiModel } from "./ai-model";
import { EncryptionTab } from "./encryption";
import { ProductSettingsTab } from "./product-settings-tab";
import { SecurityTab } from "./security";
import { SubOrgsTab } from "./sub-orgs";

const noop = () => {};

const GENERAL_TAB = "tab-org-general";

const orgDetailsSchema = z.object({
  name: GenericResourceNameSchema,
  slug: z
    .string()
    .regex(/^[a-zA-Z0-9-]+$/, "Slug must only contain alphanumeric characters or hyphens")
});

const subOrgDetailsSchema = z.object({ name: GenericResourceNameSchema, slug: slugSchema() });

type Details = { name: string; slug: string; role: string };

const OrganizationDetails = ({
  organization,
  roles,
  isSubOrganization,
  canEdit
}: {
  organization: Organization;
  roles?: Pick<TOrgRole, "id" | "name" | "slug">[];
  isSubOrganization: boolean;
  canEdit: boolean;
}) => {
  const queryClient = useQueryClient();
  const updateOrganization = useV4Adapter("org").useUpdateOrganization();
  const updateSubOrganization = useV4Adapter("orgSettings").useUpdateSubOrganization();
  const [saved, setSaved] = useState<Details>({
    name: organization.name,
    slug: organization.slug,
    role: isCustomOrgRole(organization.defaultMembershipRole)
      ? (roles?.find((role) => role.id === organization.defaultMembershipRole)?.slug ?? "")
      : organization.defaultMembershipRole
  });
  const [draft, setDraft] = useState(saved);
  const [copied, setCopied] = useState(false);
  const dirty = draft.name !== saved.name || draft.slug !== saved.slug || draft.role !== saved.role;
  const issues = (isSubOrganization ? subOrgDetailsSchema : orgDetailsSchema)
    .safeParse(draft)
    .error?.flatten().fieldErrors;
  return (
    <SettingsCard
      title="Organization details"
      hint={`Changes apply to everyone in ${saved.name}.`}
      dirty={dirty}
      locked={canEdit ? undefined : RESTRICTED}
      onDiscard={() => setDraft(saved)}
      onSave={async () => {
        if (issues) {
          failed("Fix the highlighted fields, then save again.");
          return;
        }
        try {
          if (isSubOrganization) {
            await updateSubOrganization.mutateAsync({
              subOrgId: organization.id,
              name: draft.name,
              slug: draft.slug
            });
            queryClient.invalidateQueries();
          } else {
            await updateOrganization.mutateAsync({
              orgId: organization.id,
              name: draft.name,
              slug: draft.slug,
              defaultMembershipRoleSlug: draft.role || undefined
            });
          }
        } catch (error) {
          failed("Failed to save organization details", error);
          return;
        }
        setSaved(draft);
        savedToast("Organization details saved");
      }}
    >
      <Stack gap={16}>
        <Field label="Organization name" error={issues?.name?.[0]}>
          <Input
            value={draft.name}
            invalid={Boolean(issues?.name)}
            disabledReason={canEdit ? undefined : RESTRICTED}
            autoComplete="off"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
        <Field label="Organization ID">
          <Input
            mono
            readOnly
            value={organization.id}
            trailing={
              <Tooltip content={copied ? "Copied" : "Copy organization ID"} side="top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  icon={copied ? "check" : "copy"}
                  iconOnly
                  onClick={async () => {
                    if (!(await copyText(organization.id))) return;
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1200);
                  }}
                >
                  Copy organization ID
                </Button>
              </Tooltip>
            }
          />
        </Field>
        <Field label="Organization slug" error={issues?.slug?.[0]}>
          <Input
            mono
            value={draft.slug}
            invalid={Boolean(issues?.slug)}
            disabledReason={canEdit ? undefined : RESTRICTED}
            onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
          />
        </Field>
        {roles && !isSubOrganization && (
          <Field
            label="Default organization member role"
            description="New members get this role unless their invite sets another."
          >
            <Select
              aria-label="Default organization member role"
              placeholder="Select role"
              options={roles.map((role) => ({ value: role.slug, label: role.name }))}
              value={draft.role}
              disabled={!canEdit}
              onChange={(role: string) => setDraft({ ...draft, role })}
            />
          </Field>
        )}
      </Stack>
    </SettingsCard>
  );
};

const AddContactDialog = ({
  orgId,
  open,
  onOpenChange
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const addContact = useV4Adapter("org").useAddIncidentContact();
  const formId = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setEmail("");
          setError(undefined);
        }
      }}
    >
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Add incident contact</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (!z.string().email().safeParse(email.trim()).success) {
              setError("Enter a valid email address.");
              return;
            }
            setPending(true);
            try {
              await addContact.mutateAsync({ orgId, email: email.trim() });
              setEmail("");
              setError(undefined);
              onOpenChange(false);
            } catch {
              setError("The contact was not added. Try again.");
            } finally {
              setPending(false);
            }
          }}
        >
          <Field label="Email" error={error}>
            <Input
              type="email"
              autoComplete="off"
              placeholder="security@example.com"
              value={email}
              invalid={Boolean(error)}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={pending}>
            Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const IncidentContactsTable = ({
  orgId,
  search,
  canDelete,
  onRemove
}: {
  orgId: string;
  search: string;
  canDelete: boolean;
  onRemove: (contact: IncidentContact) => void;
}) => {
  const { data: contacts = [], isPending } = useV4Adapter("org").useIncidentContacts(orgId);
  const needle = search.trim().toLowerCase();
  const rows = contacts.filter((entry) => entry.email.toLowerCase().includes(needle));
  const columns: DataTableColumn<IncidentContact>[] = [
    {
      id: "email",
      header: "Email",
      primary: true,
      grow: true,
      text: (row) => row.email,
      render: (row) => row.email
    },
    {
      id: "added",
      header: "Added",
      width: 120,
      render: (row) => new Date(row.createdAt).toISOString().slice(0, 10)
    }
  ];
  return isPending || rows.length > 0 ? (
    <DataTable
      label="Incident contacts"
      rows={rows}
      columns={columns}
      loading={isPending}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.email}
      rowActions={{
        renderMenu: (row) => (
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDelete}
            description={canDelete ? undefined : RESTRICTED}
            onSelect={() => onRemove(row)}
          >
            <Icon name="trash" />
            Remove contact
          </DropdownMenuItem>
        )
      }}
    />
  ) : (
    <EmptyState
      size="sm"
      icon="search"
      title={contacts.length ? "No contacts match" : "No incident contacts"}
    />
  );
};

const IncidentContacts = ({ orgId }: { orgId: string }) => {
  const deleteContact = useV4Adapter("org").useDeleteIncidentContact();
  const { permission } = useOrgPermission();
  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);
  const canCreate = permission.can(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.IncidentAccount
  );
  const canDelete = permission.can(
    OrgPermissionActions.Delete,
    OrgPermissionSubjects.IncidentAccount
  );
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<IncidentContact | null>(null);
  return (
    <>
      <SettingsCard
        flush
        title="Incident contacts"
        description="Emailed if a severe incident affects your organization."
        action={
          <Inline gap={8} wrap={false}>
            <ListToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search incident contacts by email"
            />
            <Button
              variant="accent"
              icon="plus"
              disabledReason={canCreate ? undefined : RESTRICTED}
              onClick={() => setAdding(true)}
            >
              Add contact
            </Button>
          </Inline>
        }
      >
        {canRead ? (
          <IncidentContactsTable
            orgId={orgId}
            search={search}
            canDelete={canDelete}
            onRemove={setRemoving}
          />
        ) : (
          <AccessRestricted />
        )}
      </SettingsCard>
      <AddContactDialog orgId={orgId} open={adding} onOpenChange={setAdding} />
      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This address stops receiving incident notifications for your organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing)
                  deleteContact
                    .mutateAsync({ orgId, incidentContactId: removing.id })
                    .catch((error) => failed("Failed to remove incident contact", error));
                setRemoving(null);
              }}
            >
              Remove contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const CONFIRM_KEYWORD = "confirm";

const DeleteOrganization = ({
  orgId,
  orgName,
  isSubOrganization
}: {
  orgId: string;
  orgName: string;
  isSubOrganization: boolean;
}) => {
  const billing = useV4Adapter("billing");
  const deleteOrganization = useV4Adapter("org").useDeleteOrganization();
  const [open, setOpen] = useState(false);
  const overview = billing.useOverview(orgId, { enabled: !isSubOrganization });
  const isCloud = billing.useIsCloud();
  const cancelsSubscription = !isSubOrganization && (overview.data?.isCloud ?? isCloud);
  return (
    <>
      <SettingsCard
        tone="danger"
        title="Delete organization"
        actions={
          <Button variant="destructive" size="sm" icon="trash" onClick={() => setOpen(true)}>
            Delete organization
          </Button>
        }
      />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent
          tone="danger"
          confirmText={CONFIRM_KEYWORD}
          pending={deleteOrganization.isPending}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {orgName}?</AlertDialogTitle>
            <AlertDialogDescription>
              All of its data is deleted and can&apos;t be recovered.
              {cancelsSubscription &&
                " Its subscription is canceled immediately, and any remaining prepaid commitment is forfeited without a refund."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                try {
                  await deleteOrganization.mutateAsync({ organizationId: orgId });
                } catch (error) {
                  failed("Failed to delete organization", error);
                  return;
                }
                setOpen(false);
                savedToast("Organization deleted");
              }}
            >
              Delete organization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const GeneralTab = () => {
  const { organization: current } = useV4Session();
  const org = useV4Adapter("org");
  const { data: organization } = org.useOrganization(current.id);
  const { permission, isPending: isPermissionPending, hasOrgRole } = useOrgPermission();
  const needsRoles =
    !current.isSubOrganization &&
    permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  const { data: roles } = org.useRoles(current.id, needsRoles);
  return (
    <Stack gap={24}>
      <PageHeader
        title="General"
        description={
          current.isSubOrganization
            ? "Manage this sub-organization's name, slug, and default role."
            : "Manage this organization's name, slug, default role, and incident contacts."
        }
      />
      <Alert tone="info">
        <AlertTitle>Some settings have moved</AlertTitle>
        <AlertDescription>
          Audit log streams now live under Audit logs, and workflow integrations, OAuth
          applications, and external migrations have moved to Integrations.
        </AlertDescription>
      </Alert>
      {organization && !isPermissionPending && (roles || !needsRoles) ? (
        <OrganizationDetails
          key={organization.id}
          organization={organization}
          roles={needsRoles ? roles : undefined}
          isSubOrganization={current.isSubOrganization}
          canEdit={canEdit}
        />
      ) : (
        <SettingsCard title="Organization details" loading onSave={noop} />
      )}
      {!current.isSubOrganization && <IncidentContacts orgId={current.id} />}
      <OrgAiModel />
      {hasOrgRole(OrgMembershipRole.Admin) && (
        <DeleteOrganization
          orgId={current.id}
          orgName={current.name}
          isSubOrganization={current.isSubOrganization}
        />
      )}
    </Stack>
  );
};

const SubOrgsUpgrade = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/settings" });
  return (
    <Stack gap={24}>
      <PageHeader title="Sub-organizations" />
      <EmptyState
        icon="lock"
        title="Upgrade your plan to use sub-organizations"
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/billing")}>View plans</a>
          </Button>
        }
      />
    </Stack>
  );
};

const MOVED_SETTINGS_TABS: Record<string, string> = {
  "workflow-integrations": "/integrations?selectedTab=workflow-integrations",
  "tag-audit-log-streams": "/audit-logs?selectedTab=streams",
  "oauth-applications": "/oauth-applications",
  "tab-external-migrations": "/integrations?selectedTab=external-migrations",
  "sso-settings": "/sso?selectedTab=sso",
  "provisioning-settings": "/sso?selectedTab=provisioning",
  "project-templates": "/projects/secret-management/product-settings"
};

export const SettingsPage = () => {
  const { selectedTab } = useSearch({ from: "/v4/organizations/$orgId/settings" });
  const moved = MOVED_SETTINGS_TABS[selectedTab];
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/settings" });
  const navigate = useNavigate();
  useEffect(() => {
    if (moved) navigate({ href: orgHref(orgId, moved), replace: true });
  }, [moved, orgId]);
  const { organization } = useV4Session();
  const { data: entitlements } = useV4Adapter("orgSettings").useEntitlements(orgId);
  const isSubOrg = organization.isSubOrganization;
  const tabs = [
    { key: GENERAL_TAB, name: "General", component: GeneralTab },
    { key: "tab-org-security", name: "Security", component: SecurityTab, hidden: isSubOrg },
    { key: "tab-org-encryption", name: "Encryption", component: EncryptionTab },
    { key: "product-settings", name: "Product settings", component: ProductSettingsTab },
    {
      key: "tab-sub-organizations",
      name: "Sub-organizations",
      component: entitlements && !entitlements.subOrganization ? SubOrgsUpgrade : SubOrgsTab,
      hidden: isSubOrg
    }
  ].filter((tab) => !tab.hidden);
  if (moved) return null;
  const active = tabs.find((tab) => tab.key === selectedTab) ?? tabs[0];
  const Active = active.component;
  return (
    <TooltipProvider>
      <PageTitle
        title={`${active.name} - ${isSubOrg ? "Sub-organization" : "Organization"} settings`}
      />
      <Active />
    </TooltipProvider>
  );
};
