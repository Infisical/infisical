import { useState } from "react";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { StatusText } from "@app/components/v4/ui/text";
import type { AdminEmailDomain } from "@app/hooks/api/admin/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { ConfirmDialog, pagination, usePageReset, usePaging } from "./shared";

type OrganizationOption = { id: string; name: string };

const serverMessage = (error: unknown) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

const AddEmailDomainForm = ({ onClose }: { onClose: () => void }) => {
  const admin = useV4Adapter("admin");
  const createEmailDomain = admin.useCreateEmailDomain();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useDebounce(search, 500);
  const { data, isPending } = admin.useOrganizations({ limit: 20, searchTerm: debouncedSearch });
  const [organization, setOrganization] = useState<OrganizationOption>();
  const [domain, setDomain] = useState("");
  const [errors, setErrors] = useState<{ organization?: string; domain?: string }>({});
  const [pending, setPending] = useState(false);
  const found = (data?.organizations ?? []).map(({ id, name }) => ({ id, name }));
  const options = [
    ...(organization && !found.some((entry) => entry.id === organization.id) ? [organization] : []),
    ...found
  ];

  const submit = async () => {
    const normalized = domain.trim().toLowerCase();
    const next = {
      organization: organization ? undefined : "Organization is required",
      domain: normalized ? undefined : "Domain is required"
    };
    setErrors(next);
    if (!organization || !normalized) return;
    setPending(true);
    try {
      await createEmailDomain.mutateAsync({ orgId: organization.id, domain: normalized });
      saved("Email domain added successfully");
      onClose();
    } catch (error) {
      failed(serverMessage(error) || "Failed to add email domain");
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogContent pending={pending}>
      <DialogHeader>
        <DialogTitle>Add verified email domain</DialogTitle>
      </DialogHeader>
      <form
        id="add-email-domain"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap={16}>
          <Field label="Organization" error={errors.organization}>
            <Combobox
              label="Organization"
              placeholder="Select organization..."
              emptyText="No organizations found"
              options={options.map((entry) => ({ value: entry.id, label: entry.name }))}
              value={organization?.id ?? ""}
              invalid={Boolean(errors.organization)}
              loading={search !== debouncedSearch || isPending}
              onSearch={(query) => {
                setSearch(query);
                if (!query) setDebouncedSearch("");
              }}
              onChange={(id) => {
                setOrganization(options.find((entry) => entry.id === id));
                setErrors((current) => ({ ...current, organization: undefined }));
              }}
            />
          </Field>
          <Field label="Domain" error={errors.domain}>
            <Input
              mono
              autoComplete="off"
              placeholder="company.com"
              value={domain}
              invalid={Boolean(errors.domain)}
              onChange={(event) => setDomain(event.target.value)}
            />
          </Field>
        </Stack>
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="add-email-domain" loading={pending}>
          Add domain
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export const EmailDomainsTab = () => {
  const admin = useV4Adapter("admin");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);
  const paging = usePaging("ResourceOverviewEmailDomainsTable", 10);
  const { data, isPending, error } = admin.useEmailDomains({
    limit: paging.perPage,
    offset: paging.offset,
    searchTerm: debouncedSearch
  });
  const emailDomains = data?.emailDomains ?? [];
  const totalCount = data?.totalCount ?? 0;
  usePageReset(paging, totalCount);
  const deleteEmailDomain = admin.useDeleteEmailDomain();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminEmailDomain>();

  if (error) throw error;

  const columns: DataTableColumn<AdminEmailDomain>[] = [
    {
      id: "domain",
      header: "Domain",
      primary: true,
      mono: true,
      grow: true,
      text: (entry) => entry.domain,
      render: (entry) => entry.domain
    },
    {
      id: "organization",
      header: "Organization",
      grow: true,
      render: (entry) => entry.orgName ?? entry.orgId
    },
    {
      id: "status",
      header: "Status",
      width: 136,
      render: (entry) =>
        entry.status === "verified" ? (
          <StatusText tone="ok" icon="check-c">
            Verified
          </StatusText>
        ) : (
          <StatusText tone="warn" icon="clock">
            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
          </StatusText>
        )
    }
  ];

  return (
    <Stack gap={16}>
      <FilterBar
        label="Email domain filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search email domains"
            placeholder="Search by domain or organization name..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              paging.setPage(1);
            }}
          />
        }
        actions={
          <Button variant="accent" icon="plus" onClick={() => setAdding(true)}>
            Add domain
          </Button>
        }
      />
      <DataTable
        label="Email domains"
        rows={emailDomains}
        columns={columns}
        loading={isPending}
        loadingRows={10}
        getRowId={(entry) => entry.id}
        rowLabel={(entry) => entry.domain}
        rowActions={{
          menuLabel: "Email domain options",
          renderMenu: (entry) => (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(entry)}>
              <Icon name="trash" />
              Delete domain
            </DropdownMenuItem>
          )
        }}
        empty={
          debouncedSearch ? (
            <EmptyState size="sm" icon="search" title="No email domains match search" />
          ) : (
            <EmptyState size="sm" icon="globe" title="No email domains found" />
          )
        }
        pagination={pagination(paging, totalCount, "Email domain pages")}
      />
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && <AddEmailDomainForm onClose={() => setAdding(false)} />}
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete domain ${deleting?.domain ?? ""}?`}
        confirmText="delete"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteEmailDomain.mutateAsync(deleting.id);
          saved("Email domain deleted");
        }}
      />
    </Stack>
  );
};
