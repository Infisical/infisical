import { useMemo, useState } from "react";

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
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@app/components/v4/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import { RowLink } from "@app/components/v4/ui/row-link";
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
import {
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/hooks/api/identities/types";
import {
  type IdentityAuthTemplate,
  type MachineAuthTemplateUsage,
  MachineIdentityAuthMethod
} from "@app/hooks/api/identityAuthTemplates/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { failed, saved } from "../toast";
import { Gate, RESTRICTED, type Sort } from "../ui";
import { Section } from "./detail-parts";
import { useDebounced } from "./use-debounced";

const METHODS = [
  { value: MachineIdentityAuthMethod.LDAP, label: "LDAP Auth" },
  { value: MachineIdentityAuthMethod.KUBERNETES, label: "Kubernetes Auth" },
  { value: MachineIdentityAuthMethod.OIDC, label: "OIDC Auth" }
];

const methodLabel = (method: MachineIdentityAuthMethod) =>
  METHODS.find((entry) => entry.value === method)?.label ?? method;

const endpointOf = (template: IdentityAuthTemplate) => {
  if (template.authMethod === MachineIdentityAuthMethod.KUBERNETES)
    return template.templateFields.kubernetesHost || "Gateway";
  if (template.authMethod === MachineIdentityAuthMethod.OIDC)
    return template.templateFields.oidcDiscoveryUrl;
  return template.templateFields.url;
};

type Draft = {
  name: string;
  method: MachineIdentityAuthMethod;
  url: string;
  bindDN: string;
  bindPass: string;
  searchBase: string;
  kubernetesHost: string;
  tokenReviewerJwt: string;
  oidcDiscoveryUrl: string;
  boundIssuer: string;
  boundAudiences: string;
};
type DraftErrors = Partial<Record<keyof Draft, string>>;

const draftOf = (template?: IdentityAuthTemplate): Draft => {
  const draft: Draft = {
    name: template?.name ?? "",
    method: template?.authMethod ?? MachineIdentityAuthMethod.LDAP,
    url: "",
    bindDN: "",
    bindPass: "",
    searchBase: "",
    kubernetesHost: "",
    tokenReviewerJwt: "",
    oidcDiscoveryUrl: "",
    boundIssuer: "",
    boundAudiences: ""
  };
  if (template?.authMethod === MachineIdentityAuthMethod.LDAP)
    return {
      ...draft,
      url: template.templateFields.url,
      bindDN: template.templateFields.bindDN,
      searchBase: template.templateFields.searchBase
    };
  if (template?.authMethod === MachineIdentityAuthMethod.KUBERNETES)
    return { ...draft, kubernetesHost: template.templateFields.kubernetesHost ?? "" };
  if (template?.authMethod === MachineIdentityAuthMethod.OIDC)
    return {
      ...draft,
      oidcDiscoveryUrl: template.templateFields.oidcDiscoveryUrl,
      boundIssuer: template.templateFields.boundIssuer,
      boundAudiences: template.templateFields.boundAudiences ?? ""
    };
  return draft;
};

const isUrl = (value: string) => {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
};

const validate = (draft: Draft, isEdit: boolean, gatewayMode: boolean): DraftErrors => {
  const errors: DraftErrors = {};
  if (!draft.name.trim()) errors.name = "Template name is required";
  if (draft.method === MachineIdentityAuthMethod.LDAP) {
    if (!draft.url.trim()) errors.url = "LDAP URL is required";
    if (!draft.bindDN.trim()) errors.bindDN = "Bind DN is required";
    if (!draft.bindPass && !isEdit) errors.bindPass = "Bind password is required";
    if (!draft.searchBase.trim()) errors.searchBase = "Search base / DN is required";
  }
  if (draft.method === MachineIdentityAuthMethod.KUBERNETES && !gatewayMode) {
    if (!draft.kubernetesHost.trim()) errors.kubernetesHost = "Kubernetes host is required";
    else if (!isUrl(draft.kubernetesHost.trim()))
      errors.kubernetesHost = "Kubernetes host must be a valid URL";
  }
  if (draft.method === MachineIdentityAuthMethod.OIDC) {
    const url = draft.oidcDiscoveryUrl.trim();
    if (!url) errors.oidcDiscoveryUrl = "OIDC discovery URL is required";
    else if (!isUrl(url)) errors.oidcDiscoveryUrl = "OIDC discovery URL must be a valid URL";
    else if (new URL(url).search || new URL(url).hash)
      errors.oidcDiscoveryUrl = "Please remove the query string or fragment.";
    else if (url.replace(/\/+$/, "").endsWith("/.well-known/openid-configuration"))
      errors.oidcDiscoveryUrl = "Please remove /.well-known/openid-configuration.";
    if (!draft.boundIssuer.trim()) errors.boundIssuer = "Issuer is required";
  }
  return errors;
};

const TemplateSheet = ({
  template,
  open,
  onOpenChange
}: {
  template?: IdentityAuthTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const create = access.useCreateIdentityAuthTemplate();
  const update = access.useUpdateIdentityAuthTemplate();
  const [draft, setDraft] = useState(() => draftOf(template));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [pending, setPending] = useState(false);
  const isEdit = Boolean(template);
  const gatewayMode =
    template?.authMethod === MachineIdentityAuthMethod.KUBERNETES &&
    template.templateFields.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Gateway;
  const set = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const text = (key: keyof Draft, label: string, placeholder: string, type = "text") => (
    <Field label={label} error={errors[key]}>
      <Input
        type={type}
        autoComplete="off"
        placeholder={placeholder}
        value={draft[key]}
        invalid={Boolean(errors[key])}
        onChange={(event) => set(key, event.target.value)}
      />
    </Field>
  );

  const templateFields = () => {
    if (draft.method === MachineIdentityAuthMethod.LDAP)
      return {
        url: draft.url.trim(),
        bindDN: draft.bindDN.trim(),
        searchBase: draft.searchBase.trim(),
        ...(draft.bindPass || !isEdit ? { bindPass: draft.bindPass } : {})
      };
    if (draft.method === MachineIdentityAuthMethod.OIDC)
      return {
        oidcDiscoveryUrl: draft.oidcDiscoveryUrl.trim(),
        boundIssuer: draft.boundIssuer.trim(),
        boundAudiences: draft.boundAudiences.trim()
      };
    if (gatewayMode) return {};
    return {
      tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
      kubernetesHost: draft.kubernetesHost.trim(),
      ...(draft.tokenReviewerJwt || !isEdit ? { tokenReviewerJwt: draft.tokenReviewerJwt } : {})
    };
  };

  const submit = async () => {
    const next = validate(draft, isEdit, gatewayMode);
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setPending(true);
    try {
      if (template)
        await update.mutateAsync({
          templateId: template.id,
          organizationId: orgId,
          name: draft.name.trim(),
          templateFields: templateFields()
        });
      else
        await create.mutateAsync({
          organizationId: orgId,
          name: draft.name.trim(),
          authMethod: draft.method,
          templateFields: templateFields() as Parameters<
            typeof create.mutateAsync
          >[0]["templateFields"]
        });
      saved(`Successfully ${isEdit ? "updated" : "created"} auth template`);
      onOpenChange(false);
    } catch (error) {
      failed(`Failed to ${isEdit ? "update" : "create"} auth template`, error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>
            {isEdit
              ? "Edit machine identity auth template"
              : "Create machine identity auth template"}
          </SheetTitle>
          <SheetDescription>
            One auth configuration that many machine identities can share.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="identity-auth-template"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              {text("name", "Template name", "My Template")}
              <Field label="Authentication method">
                <Select
                  label="Authentication method"
                  value={draft.method}
                  disabled={isEdit}
                  options={METHODS}
                  onChange={(value) => set("method", value)}
                />
              </Field>
              {draft.method === MachineIdentityAuthMethod.LDAP && (
                <>
                  {text("url", "LDAP URL", "ldaps://domain-or-ip:636")}
                  {text("bindDN", "Bind DN", "cn=infisical,ou=Users,dc=example,dc=com")}
                  {text(
                    "bindPass",
                    isEdit
                      ? "Bind password (leave empty to keep the current one)"
                      : "Bind password",
                    "********",
                    "password"
                  )}
                  {text("searchBase", "Search base / DN", "ou=machines,dc=acme,dc=com")}
                </>
              )}
              {draft.method === MachineIdentityAuthMethod.KUBERNETES &&
                (gatewayMode ? (
                  <EmptyState
                    size="sm"
                    icon="lock"
                    title="This template reviews tokens through a gateway"
                    description="Gateway settings can't be changed here. You can still rename the template."
                  />
                ) : (
                  <>
                    {text(
                      "kubernetesHost",
                      "Kubernetes host / base Kubernetes API URL",
                      "https://my-example-k8s-api-host.com"
                    )}
                    {text(
                      "tokenReviewerJwt",
                      isEdit
                        ? "Token reviewer JWT (leave empty to keep the current one)"
                        : "Token reviewer JWT (optional)",
                      "",
                      "password"
                    )}
                  </>
                ))}
              {draft.method === MachineIdentityAuthMethod.OIDC && (
                <>
                  {text(
                    "oidcDiscoveryUrl",
                    "OIDC discovery URL",
                    "https://token.actions.githubusercontent.com"
                  )}
                  {text("boundIssuer", "Issuer", "https://token.actions.githubusercontent.com")}
                  {text("boundAudiences", "Audiences (optional)", "sts.amazonaws.com")}
                </>
              )}
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="identity-auth-template" loading={pending}>
              {isEdit ? "Update template" : "Create template"}
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const UsagesDialog = ({
  template,
  onClose
}: {
  template: IdentityAuthTemplate;
  onClose: () => void;
}) => {
  const go = useGo();
  const orgId = useOrgId();
  const { data: usages = [], isPending } = useV4Adapter("access").useIdentityAuthTemplateUsages({
    templateId: template.id,
    organizationId: orgId
  });
  const columns: DataTableColumn<MachineAuthTemplateUsage>[] = [
    {
      id: "name",
      header: "Identity name",
      grow: true,
      render: (usage) => (
        <RowLink
          link={go.link(accessLinks.orgIdentity(orgId, usage.identityId))}
          title={usage.identityName}
        >
          {usage.identityName}
        </RowLink>
      )
    },
    { id: "id", header: "Identity ID", render: (usage) => <code>{usage.identityId}</code> }
  ];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Usages for identity auth template: ${template.name}`}</DialogTitle>
        </DialogHeader>
        <DataTable
          label={`Machine identities using ${template.name}`}
          rows={usages}
          columns={columns}
          getRowId={(usage) => usage.identityId}
          rowLabel={(usage) => usage.identityName}
          loading={isPending}
          loadingRows={3}
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
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const can = (action: OrgPermissionMachineIdentityAuthTemplateActions) =>
    permission.can(action, OrgPermissionSubjects.MachineIdentityAuthTemplate);
  const canList = can(OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates);
  const canCreate = can(OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates);
  const canEdit = can(OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates);
  const canDelete = can(OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const debouncedSearch = useDebounced(search.trim());
  const { data, isPending } = access.useIdentityAuthTemplates({
    organizationId: orgId,
    limit: perPage,
    offset: (page - 1) * perPage,
    search: debouncedSearch,
    isDisabled: !canList
  });
  const remove = access.useDeleteIdentityAuthTemplate();
  const [editing, setEditing] = useState<{ template?: IdentityAuthTemplate }>();
  const [usages, setUsages] = useState<IdentityAuthTemplate>();
  const [deleting, setDeleting] = useState<IdentityAuthTemplate>();
  const totalCount = data?.totalCount ?? 0;
  const searching = Boolean(debouncedSearch);
  const loading = canList && isPending;
  const rows = useMemo(
    () =>
      [...(data?.templates ?? [])].sort(
        (a, b) =>
          (sort.columnId === "method"
            ? methodLabel(a.authMethod).localeCompare(methodLabel(b.authMethod))
            : a.name.localeCompare(b.name)) * (sort.direction === "asc" ? 1 : -1)
      ),
    [data, sort]
  );

  const columns: DataTableColumn<IdentityAuthTemplate>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (template) => <span>{template.name}</span>
    },
    {
      id: "method",
      header: "Method",
      sortable: true,
      grow: true,
      render: (template) => (
        <Inline gap={8} wrap={false}>
          <Icon
            name={template.authMethod === MachineIdentityAuthMethod.KUBERNETES ? "apps" : "key"}
          />
          <span>{methodLabel(template.authMethod)}</span>
        </Inline>
      )
    },
    {
      id: "endpoint",
      header: "Host / URL",
      grow: true,
      render: (template) => <span>{endpointOf(template)}</span>
    }
  ];

  const rowActions: DataTableRowActions<IdentityAuthTemplate> = {
    inline: [
      {
        label: "Edit template",
        icon: "settings",
        disabledReason: () => (canEdit ? undefined : RESTRICTED),
        onSelect: (template) => setEditing({ template })
      }
    ],
    renderMenu: (template) => (
      <>
        <DropdownMenuItem onSelect={() => setUsages(template)}>
          <Icon name="eye" />
          View usages
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setDeleting(template)}
        >
          <Icon name="trash" />
          Delete template
        </DropdownMenuItem>
      </>
    )
  };

  return (
    <Section
      title="Machine identity auth templates"
      action={
        <Gate allowed={canCreate}>
          <Button
            variant="outline"
            icon="plus"
            disabled={!canCreate}
            onClick={() => setEditing({})}
          >
            Create
          </Button>
        </Gate>
      }
    >
      {canList && (loading || searching || totalCount > 0) && (
        <>
          <Input
            icon="search"
            placeholder="Search templates by name..."
            aria-label="Search templates by name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <DataTable
            label="Machine identity auth templates"
            rows={rows}
            columns={columns}
            rowActions={rowActions}
            getRowId={(template) => template.id}
            rowLabel={(template) => template.name}
            loading={loading}
            loadingRows={3}
            sort={sort}
            onSortChange={setSort}
            empty={<EmptyState size="sm" icon="search" title="No templates match search filter" />}
            pagination={
              !loading && totalCount > 0 ? (
                <Pagination
                  label="Auth template pages"
                  variant="compact"
                  page={page}
                  total={totalCount}
                  pageSize={perPage}
                  pageSizeOptions={[10, 20, 50, 100]}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPerPage(size);
                    setPage(1);
                  }}
                />
              ) : undefined
            }
          />
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
      {usages && <UsagesDialog template={usages} onClose={() => setUsages(undefined)} />}
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
              onClick={async () => {
                if (!deleting) return;
                setDeleting(undefined);
                try {
                  await remove.mutateAsync({ templateId: deleting.id, organizationId: orgId });
                  saved("Successfully deleted template");
                } catch (error) {
                  failed("Failed to delete template", error);
                }
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
