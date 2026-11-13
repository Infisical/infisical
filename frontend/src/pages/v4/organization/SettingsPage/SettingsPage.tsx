import { useId, useState } from "react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyState,
  EmptyTitle
} from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { isCustomOrgRole } from "@app/helpers/roles";
import type { IncidentContact } from "@app/hooks/api/incidentContacts/types";
import type { Organization } from "@app/hooks/api/organization/types";
import type { TOrgRole } from "@app/hooks/api/roles/types";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { failed, saved as savedToast } from "../../access/toast";
import { ListToolbar } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref } from "../../links";

const GENERAL_TAB = "tab-org-general";

const detailsSchema = z.object({
  name: GenericResourceNameSchema,
  slug: z
    .string()
    .regex(/^[a-zA-Z0-9-]+$/, "Slug must only contain alphanumeric characters or hyphens")
});

type Details = { name: string; slug: string; role: string };

const OrganizationDetails = ({
  organization,
  roles
}: {
  organization: Organization;
  roles: Pick<TOrgRole, "id" | "name" | "slug">[];
}) => {
  const updateOrganization = useV4Adapter("org").useUpdateOrganization();
  const [saved, setSaved] = useState<Details>({
    name: organization.name,
    slug: organization.slug,
    role: isCustomOrgRole(organization.defaultMembershipRole)
      ? (roles.find((role) => role.id === organization.defaultMembershipRole)?.slug ?? "")
      : organization.defaultMembershipRole
  });
  const [draft, setDraft] = useState(saved);
  const [copied, setCopied] = useState(false);
  const dirty = draft.name !== saved.name || draft.slug !== saved.slug || draft.role !== saved.role;
  const issues = detailsSchema.safeParse(draft).error?.flatten().fieldErrors;
  return (
    <SettingsCard
      title="Organization details"
      hint={`Changes apply to everyone in ${saved.name}.`}
      dirty={dirty}
      onDiscard={() => setDraft(saved)}
      onSave={async () => {
        if (issues) {
          failed("Fix the highlighted fields, then save again.");
          return;
        }
        try {
          await updateOrganization.mutateAsync({
            orgId: organization.id,
            name: draft.name,
            slug: draft.slug,
            defaultMembershipRoleSlug: draft.role || undefined
          });
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
                  onClick={() => {
                    navigator.clipboard?.writeText(organization.id).catch(() => undefined);
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
            onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
          />
        </Field>
        <Field
          label="Default organization member role"
          description="New members get this role unless their invite sets another."
        >
          <Select
            aria-label="Default organization member role"
            placeholder="Select role"
            options={roles.map((role) => ({ value: role.slug, label: role.name }))}
            value={draft.role}
            onChange={(role: string) => setDraft({ ...draft, role })}
          />
        </Field>
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

const IncidentContacts = ({ orgId }: { orgId: string }) => {
  const org = useV4Adapter("org");
  const { data: contacts = [], isPending } = org.useIncidentContacts(orgId);
  const deleteContact = org.useDeleteIncidentContact();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<IncidentContact | null>(null);
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
  return (
    <>
      <SettingsCard
        flush
        title="Incident contacts"
        description="Emailed if a severe incident affects your organization."
        action={
          <Inline gap={8} wrap={false}>
            <ListToolbar
              band
              search={search}
              onSearch={setSearch}
              placeholder="Search incident contacts by email"
            />
            <Button variant="accent" size="xs" icon="plus" onClick={() => setAdding(true)}>
              Add contact
            </Button>
          </Inline>
        }
      >
        {isPending || rows.length > 0 ? (
          <DataTable
            label="Incident contacts"
            rows={rows}
            columns={columns}
            loading={isPending}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.email}
            rowActions={{
              renderMenu: (row) => (
                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(row)}>
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

const GeneralTab = () => {
  const { organization: current } = useV4Session();
  const org = useV4Adapter("org");
  const { data: organization } = org.useOrganization(current.id);
  const { data: roles } = org.useRoles(current.id);
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
      {organization && roles ? (
        <OrganizationDetails key={organization.id} organization={organization} roles={roles} />
      ) : (
        <SettingsCard title="Organization details" loading />
      )}
      {!current.isSubOrganization && <IncidentContacts orgId={current.id} />}
    </Stack>
  );
};

export const SettingsPage = () => {
  const { selectedTab } = useSearch({ from: "/v4/organizations/$orgId/settings" });
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/settings" });
  if (selectedTab && selectedTab !== GENERAL_TAB) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>This settings tab isn&apos;t in v4 yet</EmptyTitle>
          <EmptyDescription>
            <a href={orgHref(orgId, "/settings")}>Go to General</a>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <TooltipProvider>
      <GeneralTab />
    </TooltipProvider>
  );
};
