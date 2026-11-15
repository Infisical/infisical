import { useMemo, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCertificateAuthorityActions } from "@app/context/ProjectPermissionContext/types";
import {
  caStatusToNameMap,
  caTypeToNameMap,
  EXTERNAL_CA_TYPE_NAME_MAP
} from "@app/hooks/api/ca/constants";
import { CaStatus, CaType, InternalCaType } from "@app/hooks/api/ca/enums";
import type {
  TInternalCertificateAuthority,
  TUnifiedCertificateAuthority
} from "@app/hooks/api/ca/types";
import { CertKeySource } from "@app/hooks/api/signers/types";

import { AccessRestricted, ListToolbar } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { CertManagerNotSetUp, shortDate } from "../components/certificate";
import { CreateCaSheet } from "./create-ca-sheet";
import { ExternalCaSheet } from "./external-ca-sheet";
import { InstallCaCertificateSheet } from "./install/install-certificate-sheet";
import { CA_DOCS, caBlock, useCaScope } from "./scope";
import {
  CaCertificateDialog,
  type CaStatusChange,
  CaStatusBadge,
  CaStatusDialog,
  DeleteCaDialog,
  useCaQuotaGate
} from "./shared";

const routeId = v4Path("/organizations/$orgId/cert-manager/certificate-authorities");

type Sort = { columnId: string; direction: "asc" | "desc" };

const keySourceLabel: Record<CertKeySource, string> = {
  [CertKeySource.Infisical]: "Infisical",
  [CertKeySource.Hsm]: "HSM",
  [CertKeySource.AwsKms]: "AWS KMS"
};

const statusOptions = Object.values(CaStatus).map((value) => ({
  value,
  label: value === CaStatus.PENDING_CERTIFICATE ? "Pending certificate" : caStatusToNameMap[value]
}));

const useListState = <T extends TUnifiedCertificateAuthority>(
  rows: T[],
  text: (row: T) => string[],
  sortKey: (row: T, columnId: string) => string
) => {
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const statusSet = new Set(statuses);
    return rows
      .filter((row) => !statusSet.size || statusSet.has(row.status))
      .filter((row) => !needle || text(row).some((value) => value.toLowerCase().includes(needle)))
      .sort(
        (a, b) =>
          sortKey(a, sort.columnId).localeCompare(sortKey(b, sort.columnId)) *
          (sort.direction === "asc" ? 1 : -1)
      );
  }, [rows, search, statuses, sort, text, sortKey]);
  const filter = {
    label: "Status",
    options: statusOptions,
    selected: statuses,
    onToggle: (value: string) =>
      setStatuses((current) =>
        current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
      )
  };
  const filtered = Boolean(search.trim()) || statuses.length > 0;
  const clear = () => {
    setSearch("");
    setStatuses([]);
  };
  return { search, setSearch, sort, setSort, visible, filter, filtered, clear };
};

const internalText = (ca: TInternalCertificateAuthority) => [
  ca.name,
  ca.configuration.commonName,
  ca.configuration.friendlyName ?? "",
  ca.id
];
const internalSortKey = (ca: TInternalCertificateAuthority, columnId: string) =>
  columnId === "expires" ? (ca.configuration.notAfter ?? "") : ca.name;

const InternalCas = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const { permission } = useCaScope();
  const { data, isPending } = useV4Adapter("certificateAuthorities").useCasByType(CaType.INTERNAL);
  const cas = (data ?? []) as TInternalCertificateAuthority[];
  const list = useListState(cas, internalText, internalSortKey);
  const quota = useCaQuotaGate("internal");
  const [creating, setCreating] = useState(false);
  const [installing, setInstalling] = useState<string>();
  const [viewing, setViewing] = useState<string>();
  const [statusChange, setStatusChange] = useState<CaStatusChange>();
  const [deleting, setDeleting] = useState<TUnifiedCertificateAuthority>();
  const block = (action: ProjectPermissionCertificateAuthorityActions, name?: string) =>
    caBlock(permission, action, name);

  const columns: DataTableColumn<TInternalCertificateAuthority>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (ca) => ca.name,
      secondary: (ca) => ca.configuration.commonName || undefined,
      render: (ca) =>
        block(ProjectPermissionCertificateAuthorityActions.Read, ca.name) ? (
          ca.name
        ) : (
          <RowLink
            link={{
              to: v4Path("/organizations/$orgId/cert-manager/ca/$caId"),
              params: { orgId, caId: ca.id }
            }}
            title={ca.name}
          >
            {ca.name}
          </RowLink>
        )
    },
    {
      id: "status",
      header: "Status",
      width: 176,
      render: (ca) => <CaStatusBadge status={ca.status} />
    },
    {
      id: "type",
      header: "Type",
      width: 128,
      render: (ca) => caTypeToNameMap[ca.configuration.type]
    },
    {
      id: "key",
      header: "Key source",
      width: 128,
      render: (ca) => keySourceLabel[ca.configuration.keySource ?? CertKeySource.Infisical]
    },
    {
      id: "expires",
      header: "Valid until",
      sortable: true,
      width: 128,
      render: (ca) => (ca.configuration.notAfter ? shortDate(ca.configuration.notAfter) : "None")
    }
  ];

  const rowActions: DataTableRowActions<TInternalCertificateAuthority> = {
    renderMenu: (ca) => {
      const pending = ca.status === CaStatus.PENDING_CERTIFICATE;
      const installBlocked = block(ProjectPermissionCertificateAuthorityActions.Create, ca.name);
      const readBlocked = block(ProjectPermissionCertificateAuthorityActions.Read, ca.name);
      const editBlocked = block(ProjectPermissionCertificateAuthorityActions.Edit, ca.name);
      const deleteBlocked = block(ProjectPermissionCertificateAuthorityActions.Delete, ca.name);
      return (
        <>
          {pending ? (
            <DropdownMenuItem disabledReason={installBlocked} onSelect={() => setInstalling(ca.id)}>
              <Icon name="upload" />
              Install CA certificate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabledReason={readBlocked} onSelect={() => setViewing(ca.id)}>
              <Icon name="cert" />
              View certificate
            </DropdownMenuItem>
          )}
          {!pending && (
            <DropdownMenuItem
              disabledReason={editBlocked}
              onSelect={() =>
                setStatusChange({
                  ca,
                  status: ca.status === CaStatus.ACTIVE ? CaStatus.DISABLED : CaStatus.ACTIVE
                })
              }
            >
              <Icon name={ca.status === CaStatus.ACTIVE ? "pause" : "check"} />
              {ca.status === CaStatus.ACTIVE ? "Disable CA" : "Enable CA"}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabledReason={deleteBlocked}
            onSelect={() => setDeleting(ca)}
          >
            <Icon name="trash" />
            Delete CA
          </DropdownMenuItem>
        </>
      );
    }
  };

  return (
    <>
      <Card
        variant="framed"
        flush
        title={
          <Inline gap={8} align="center">
            Internal certificate authorities
            <DocumentationLink href={CA_DOCS.internal} subject="internal CAs" />
          </Inline>
        }
        action={
          <Inline gap={8} align="center">
            <ListToolbar
              search={list.search}
              onSearch={list.setSearch}
              placeholder="Search internal CAs"
              filter={list.filter}
            />
            <Button
              variant="outline"
              icon="plus"
              disabledReason={block(ProjectPermissionCertificateAuthorityActions.Create)}
              onClick={() => quota.guard(() => setCreating(true))}
            >
              Create internal CA
            </Button>
          </Inline>
        }
      >
        <DataTable
          label="Internal certificate authorities"
          rows={list.visible}
          columns={columns}
          rowActions={rowActions}
          getRowId={(ca) => ca.id}
          rowLabel={(ca) => ca.name}
          loading={isPending}
          loadingRows={3}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={
            list.filtered ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No internal CAs match"
                actions={
                  <Button variant="link" onClick={list.clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                icon="shield"
                title="No internal CAs yet"
                description="Create a root CA, then intermediates under it to issue certificates."
              />
            )
          }
        />
      </Card>
      <CreateCaSheet
        orgId={orgId}
        projectId={projectId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(ca) => {
          if (ca.type === CaType.INTERNAL && ca.configuration.type === InternalCaType.INTERMEDIATE)
            setInstalling(ca.id);
        }}
      />
      <InstallCaCertificateSheet
        caId={installing}
        open={Boolean(installing)}
        onOpenChange={(open) => !open && setInstalling(undefined)}
      />
      <CaCertificateDialog caId={viewing} onClose={() => setViewing(undefined)} />
      <CaStatusDialog change={statusChange} onClose={() => setStatusChange(undefined)} />
      <DeleteCaDialog ca={deleting} onClose={() => setDeleting(undefined)} />
      {quota.upgradeGate}
    </>
  );
};

const externalText = (ca: TUnifiedCertificateAuthority) => [
  ca.name,
  EXTERNAL_CA_TYPE_NAME_MAP[ca.type] ?? ca.type,
  ca.id
];
const externalSortKey = (ca: TUnifiedCertificateAuthority, columnId: string) =>
  columnId === "type" ? (EXTERNAL_CA_TYPE_NAME_MAP[ca.type] ?? ca.type) : ca.name;

const ExternalCas = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const { permission } = useCaScope();
  const { data, isPending } = useV4Adapter("certificateAuthorities").useExternalCas();
  const list = useListState(data ?? [], externalText, externalSortKey);
  const quota = useCaQuotaGate("external");
  const [sheet, setSheet] = useState<{ ca?: TUnifiedCertificateAuthority }>();
  const [statusChange, setStatusChange] = useState<CaStatusChange>();
  const [deleting, setDeleting] = useState<TUnifiedCertificateAuthority>();
  const block = (action: ProjectPermissionCertificateAuthorityActions, name?: string) =>
    caBlock(permission, action, name);

  const columns: DataTableColumn<TUnifiedCertificateAuthority>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (ca) => ca.name,
      render: (ca) => ca.name
    },
    {
      id: "type",
      header: "Type",
      sortable: true,
      width: 240,
      render: (ca) => EXTERNAL_CA_TYPE_NAME_MAP[ca.type] ?? ca.type
    },
    {
      id: "status",
      header: "Status",
      width: 176,
      render: (ca) => <CaStatusBadge status={ca.status} />
    }
  ];

  const rowActions: DataTableRowActions<TUnifiedCertificateAuthority> = {
    inline: [
      {
        label: "Edit CA",
        icon: PencilIcon,
        disabledReason: (ca) => block(ProjectPermissionCertificateAuthorityActions.Edit, ca.name),
        onSelect: (ca) => setSheet({ ca })
      }
    ],
    renderMenu: (ca) => {
      const editBlocked = block(ProjectPermissionCertificateAuthorityActions.Edit, ca.name);
      const deleteBlocked = block(ProjectPermissionCertificateAuthorityActions.Delete, ca.name);
      return (
        <>
          {ca.status !== CaStatus.PENDING_CERTIFICATE && (
            <DropdownMenuItem
              disabledReason={editBlocked}
              onSelect={() =>
                setStatusChange({
                  ca,
                  status: ca.status === CaStatus.ACTIVE ? CaStatus.DISABLED : CaStatus.ACTIVE
                })
              }
            >
              <Icon name={ca.status === CaStatus.ACTIVE ? "pause" : "check"} />
              {ca.status === CaStatus.ACTIVE ? "Disable CA" : "Enable CA"}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabledReason={deleteBlocked}
            onSelect={() => setDeleting(ca)}
          >
            <Icon name="trash" />
            Delete CA
          </DropdownMenuItem>
        </>
      );
    }
  };

  return (
    <>
      <Card
        variant="framed"
        flush
        title={
          <Inline gap={8} align="center">
            External certificate authorities
            <DocumentationLink href={CA_DOCS.external} subject="external CAs" />
          </Inline>
        }
        action={
          <Inline gap={8} align="center">
            <ListToolbar
              search={list.search}
              onSearch={list.setSearch}
              placeholder="Search external CAs"
              filter={list.filter}
            />
            <Button
              variant="outline"
              icon="plus"
              disabledReason={block(ProjectPermissionCertificateAuthorityActions.Create)}
              onClick={() => quota.guard(() => setSheet({}))}
            >
              Connect external CA
            </Button>
          </Inline>
        }
      >
        <DataTable
          label="External certificate authorities"
          rows={list.visible}
          columns={columns}
          rowActions={rowActions}
          getRowId={(ca) => ca.id}
          rowLabel={(ca) => ca.name}
          loading={isPending}
          loadingRows={3}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowActivate={(ca) =>
            !block(ProjectPermissionCertificateAuthorityActions.Edit, ca.name) && setSheet({ ca })
          }
          empty={
            list.filtered ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No external CAs match"
                actions={
                  <Button variant="link" onClick={list.clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                icon="globe"
                title="No external CAs yet"
                description="Connect ACME, DigiCert, AWS Private CA and other providers to issue through them."
              />
            )
          }
        />
      </Card>
      <ExternalCaSheet
        orgId={orgId}
        projectId={projectId}
        open={Boolean(sheet)}
        ca={sheet?.ca}
        onOpenChange={(open) => !open && setSheet(undefined)}
      />
      <CaStatusDialog change={statusChange} onClose={() => setStatusChange(undefined)} />
      <DeleteCaDialog ca={deleting} onClose={() => setDeleting(undefined)} />
      {quota.upgradeGate}
    </>
  );
};

const CertificateAuthoritiesScreen = () => {
  const { selectedTab } = useSearch({ from: routeId });
  const navigate = useNavigate();
  const { orgId, projectId, hasProject, isPending, permission } = useCaScope();
  if (isPending) return <Loader size="page" label="Loading certificate authorities" />;
  if (!hasProject) return <CertManagerNotSetUp orgId={orgId} />;
  const tab = selectedTab === "external" ? "external" : "internal";
  const readBlocked = caBlock(permission, ProjectPermissionCertificateAuthorityActions.Read);
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Certificate authorities"
          tabs={
            readBlocked ? undefined : (
              <Tabs
                label="Certificate authority sections"
                value={tab}
                onValueChange={(next) =>
                  navigate({
                    to: routeId,
                    params: { orgId },
                    search: { selectedTab: next }
                  })
                }
                tabs={[
                  { value: "internal", label: "Internal" },
                  { value: "external", label: "External" }
                ]}
              />
            )
          }
        />
        {readBlocked && <AccessRestricted requirement="Read access to certificate authorities" />}
        {!readBlocked && tab === "internal" && <InternalCas orgId={orgId} projectId={projectId} />}
        {!readBlocked && tab === "external" && <ExternalCas orgId={orgId} projectId={projectId} />}
      </Stack>
    </TooltipProvider>
  );
};

export const CertificateAuthoritiesPage = () => (
  <>
    <PageTitle title="Certificate Authorities" />
    <CertificateAuthoritiesScreen />
  </>
);
