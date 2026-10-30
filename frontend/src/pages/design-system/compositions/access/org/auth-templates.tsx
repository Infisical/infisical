import { useState } from "react";

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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@app/components/v4/ui/dialog";
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
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";

import { useAccess } from "../context";
import { type AuthTemplate, type AuthTemplateMethod, type OrgIdentity } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, useCan, usePagedList } from "../ui";
import { Section } from "./detail-parts";

const methods: {
  value: AuthTemplateMethod;
  label: string;
  endpoint: string;
  placeholder: string;
}[] = [
  {
    value: "ldap",
    label: "LDAP Auth",
    endpoint: "LDAP URL",
    placeholder: "ldaps://domain-or-ip:636"
  },
  {
    value: "kubernetes",
    label: "Kubernetes Auth",
    endpoint: "Kubernetes host / base Kubernetes API URL",
    placeholder: "https://my-example-k8s-api-host.com"
  },
  {
    value: "oidc",
    label: "OIDC Auth",
    endpoint: "OIDC discovery URL",
    placeholder: "https://token.actions.githubusercontent.com"
  }
];
const methodOf = (value: AuthTemplateMethod) => methods.find((m) => m.value === value)!;

const TemplateSheet = ({
  template,
  open,
  onOpenChange
}: {
  template?: AuthTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { update, saved } = useAccess();
  const [name, setName] = useState(template?.name ?? "");
  const [method, setMethod] = useState<AuthTemplateMethod>(template?.method ?? "ldap");
  const [endpoint, setEndpoint] = useState(template?.endpoint ?? "");
  const [errors, setErrors] = useState<{ name?: string; endpoint?: string }>({});
  const isEdit = Boolean(template);
  const option = methodOf(method);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {isEdit
              ? "Edit machine identity auth template"
              : "Create machine identity auth template"}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? "Update the authentication template" : "Create a new authentication template"}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="identity-auth-template"
            onSubmit={(event) => {
              event.preventDefault();
              const next = {
                name: name.trim() ? undefined : "Template name is required",
                endpoint: endpoint.trim() ? undefined : "Required"
              };
              setErrors(next);
              if (next.name || next.endpoint) return;
              update((current) => ({
                ...current,
                identityAuthTemplates: template
                  ? current.identityAuthTemplates.map((item) =>
                      item.id === template.id
                        ? { ...item, name: name.trim(), endpoint: endpoint.trim() }
                        : item
                    )
                  : [
                      ...current.identityAuthTemplates,
                      {
                        id: crypto.randomUUID(),
                        name: name.trim(),
                        method,
                        endpoint: endpoint.trim(),
                        usages: []
                      }
                    ]
              }));
              saved(`Successfully ${isEdit ? "updated" : "created"} auth template`);
              onOpenChange(false);
            }}
          >
            <Stack gap={16}>
              <Field label="Template name" error={errors.name}>
                <Input
                  placeholder="My Template"
                  value={name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="Authentication method">
                <Select
                  label="Authentication method"
                  value={method}
                  disabled={isEdit}
                  options={methods.map(({ value, label }) => ({ value, label }))}
                  onChange={(value) => setMethod(value as AuthTemplateMethod)}
                />
              </Field>
              <Field label={option.endpoint} error={errors.endpoint}>
                <Input
                  placeholder={option.placeholder}
                  value={endpoint}
                  invalid={Boolean(errors.endpoint)}
                  onChange={(event) => setEndpoint(event.target.value)}
                />
              </Field>
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="identity-auth-template">
            {isEdit ? "Update template" : "Create template"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const UsagesDialog = ({ template, onClose }: { template?: AuthTemplate; onClose: () => void }) => {
  const { data } = useAccess();
  const rows = data.orgIdentities.filter((identity) => template?.usages.includes(identity.id));
  const columns: AccessColumn<OrgIdentity>[] = [
    { id: "name", header: "Identity name", render: (identity) => <span>{identity.name}</span> },
    { id: "id", header: "Identity ID", render: (identity) => <span>{identity.id}</span> }
  ];
  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Usages for identity auth template: ${template?.name ?? ""}`}</DialogTitle>
        </DialogHeader>
        <AccessTable
          label={`Machine identities using ${template?.name ?? "template"}`}
          rows={rows}
          columns={columns}
          getRowId={(identity) => identity.id}
          rowLabel={(identity) => identity.name}
          empty={
            <EmptyState
              size="sm"
              icon="machine"
              title="This template is not currently being used by any identities"
            />
          }
        />
      </DialogContent>
    </Dialog>
  );
};

export const AuthTemplatesSection = () => {
  const { data, update, saved, loading } = useAccess();
  const can = useCan("org");
  const [editing, setEditing] = useState<{ template?: AuthTemplate }>();
  const [usages, setUsages] = useState<AuthTemplate>();
  const [deleting, setDeleting] = useState<AuthTemplate>();
  const list = usePagedList({
    rows: data.identityAuthTemplates,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (template, needle) => template.name.toLowerCase().includes(needle),
    compare: (a, b, column) =>
      column === "method"
        ? methodOf(a.method).label.localeCompare(methodOf(b.method).label)
        : a.name.localeCompare(b.name)
  });
  const searching = Boolean(list.search.trim());
  const columns: AccessColumn<AuthTemplate>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "25%",
      render: (template) => <span>{template.name}</span>
    },
    {
      id: "method",
      header: "Method",
      sortable: true,
      width: "25%",
      render: (template) => (
        <>
          <Icon name={template.method === "kubernetes" ? "apps" : "key"} />
          <span>{methodOf(template.method).label}</span>
        </>
      )
    },
    {
      id: "endpoint",
      header: "Host / URL",
      render: (template) => <span>{template.endpoint}</span>
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (template) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Actions for ${template.name}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setUsages(template)}>
              <Icon name="eye" />
              View usages
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!can("identity", "edit")}
              onSelect={() => setEditing({ template })}
            >
              <Icon name="settings" />
              Edit template
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!can("identity", "delete")}
              onSelect={() => setDeleting(template)}
            >
              <Icon name="trash" />
              Delete template
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
  return (
    <Section
      title="Machine identity auth templates"
      description="Reuse authentication configurations across machine identities to keep settings consistent and easier to manage."
      action={
        <Gate allowed={can("identity", "create")}>
          <Button
            variant="outline"
            icon="plus"
            disabled={!can("identity", "create")}
            onClick={() => setEditing({})}
          >
            Create
          </Button>
        </Gate>
      }
    >
      {(loading || searching || data.identityAuthTemplates.length > 0) && (
        <>
          <Input
            icon="search"
            placeholder="Search templates by name..."
            aria-label="Search templates by name"
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
          <Stack gap={8}>
            <AccessTable
              label="Machine identity auth templates"
              rows={list.pageRows}
              columns={columns}
              getRowId={(template) => template.id}
              rowLabel={(template) => template.name}
              loading={loading ? 3 : undefined}
              sort={list.sort}
              onSortChange={list.setSort}
              empty={
                <EmptyState
                  size="sm"
                  icon="search"
                  title="No templates match search filter"
                  description="Adjust your search criteria."
                />
              }
            />
            {!loading && list.pagination}
          </Stack>
        </>
      )}
      {editing && (
        <TemplateSheet
          key={editing.template?.id ?? "new"}
          template={editing.template}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      )}
      <UsagesDialog template={usages} onClose={() => setUsages(undefined)} />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${deleting?.name ?? "template"}?`}</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                update((current) => ({
                  ...current,
                  identityAuthTemplates: current.identityAuthTemplates.filter(
                    (item) => item.id !== deleting?.id
                  )
                }));
                setDeleting(undefined);
                saved("Successfully deleted template");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
};
