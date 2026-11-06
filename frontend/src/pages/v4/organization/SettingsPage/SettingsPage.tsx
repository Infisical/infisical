import { useId, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
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
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyState,
  EmptyTitle
} from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { isCustomOrgRole } from "@app/helpers/roles";
import type { IncidentContact } from "@app/hooks/api/incidentContacts/types";
import type { Organization } from "@app/hooks/api/organization/types";
import type { TOrgRole } from "@app/hooks/api/roles/types";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";

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
      description="Update your organization's name, slug, and default member role."
      hint={`Changes apply to everyone in ${saved.name}.`}
      dirty={dirty}
      onDiscard={() => setDraft(saved)}
      onSave={async () => {
        if (issues) throw new Error("Fix the highlighted fields, then save again.");
        await updateOrganization.mutateAsync({
          orgId: organization.id,
          name: draft.name,
          slug: draft.slug,
          defaultMembershipRoleSlug: draft.role || undefined
        });
        setSaved(draft);
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
          description="Users joining your organization get this role unless an invite says otherwise."
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
          <DialogDescription>
            This address is emailed if a severe incident affects your organization.
          </DialogDescription>
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
  let hint = "No incident contacts yet.";
  if (contacts.length === 1) hint = "1 incident contact.";
  else if (contacts.length > 1) hint = `${contacts.length} incident contacts.`;
  return (
    <>
      <SettingsCard
        title="Incident contacts"
        description="Contacts notified in the unlikely event of a severe incident."
        action={
          <Button variant="outline" size="sm" icon="plus" onClick={() => setAdding(true)}>
            Add contact
          </Button>
        }
        hint={hint}
      >
        <Stack gap={12}>
          <Input
            icon="search"
            aria-label="Search incident contacts"
            placeholder="Search incident contacts by email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
            empty={
              <EmptyState
                size="sm"
                icon="search"
                title={contacts.length ? "No contacts match" : "No incident contacts"}
                description={
                  contacts.length
                    ? "Try another email address."
                    : "Add a contact to be told about severe incidents."
                }
              />
            }
          />
        </Stack>
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
                if (removing) deleteContact.mutateAsync({ orgId, incidentContactId: removing.id });
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
            ? "Update your sub-organization's name and other general settings."
            : "Update your organization's name, incident contacts, and other general settings."
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
        <SettingsCard
          title="Organization details"
          description="Update your organization's name, slug, and default member role."
          loading
        />
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
            Only General has been ported. Open it from the sidebar or{" "}
            <a href={`/v4/organizations/${orgId}/settings`}>go to General</a>.
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
