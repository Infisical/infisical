import { useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { useNavigate } from "@tanstack/react-router";

import type { TCertificate } from "@app/hooks/api/certificates/types";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  type TPkiApplication
} from "@app/hooks/api/pkiApplications/types";
import { getApplicationCertificateAccess } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { RESTRICTED } from "../../access/ui";
import { usePageSize } from "../../components/use-page-size";
import { useV4Adapter } from "../../data/adapters";
import type { PkiApplicationPermission } from "../../data/pki-applications/contract";
import { v4Path } from "../../links";
import {
  certificateBlocks,
  certificateName,
  CertificateStatusBadge,
  DeleteCertificateDialog,
  ExpiryBadge,
  RevokeCertificateDialog,
  shortDate,
  useRevocationApprovals
} from "../components/certificate";
import { ImportCertificatesSheet } from "../components/certificate-requests/import-sheet";
import { filterParams, inventoryFields } from "../InventoryPage/inventory-filters";
import {
  type InventoryView,
  InventoryViewsMenu,
  type InventoryViewScope
} from "../InventoryPage/inventory-views";
import { appCan, plural } from "./shared";

const certificatePath = v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId");

export const CertificatesTab = ({
  orgId,
  projectId,
  application,
  access,
  initialSearch
}: {
  orgId: string;
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
  initialSearch?: string;
}) => {
  const navigate = useNavigate();
  const adapter = useV4Adapter("pkiApplications");
  const { data: authorities = [] } = useV4Adapter("certificates").useCertificateAuthorities();
  const revocationOf = useRevocationApprovals(application.id);
  const { data: profiles = [] } = adapter.useApplicationProfiles(application.id);
  const [query, setQuery] = useState(initialSearch ?? "");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewScope, setViewScope] = useState<InventoryViewScope>();
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "expires",
    direction: "asc"
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize, showPagination] = usePageSize(
    "pkiApplicationCertificatesTable",
    25
  );
  const [revoking, setRevoking] = useState<TCertificate>();
  const [deleting, setDeleting] = useState<TCertificate>();
  const [importing, setImporting] = useState(false);
  const canImport = appCan(
    access,
    PkiApplicationResourceActions.Import,
    PkiApplicationResourceSub.Certificates
  );
  const { data, isPending } = adapter.useApplicationCertificates({
    projectId,
    applicationId: application.id,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search: query.trim() || undefined,
    ...filterParams(filters),
    includeDeleted: includeDeleted || undefined,
    metadataFilter: viewScope?.metadata,
    sortBy: sort.columnId === "issued" ? "notBefore" : "notAfter",
    sortOrder: sort.direction
  });

  const rows = data?.certificates ?? [];
  const totalCount = data?.totalCount ?? 0;
  const filtered = Boolean(query.trim()) || filters.some((filter) => filter.values.length > 0);
  const certificateAccess = getApplicationCertificateAccess({
    applicationName: application.name,
    permission: access.permission
  });
  const caType = (cert: TCertificate) => authorities.find((ca) => ca.id === cert.caId)?.type;
  const open = (cert: TCertificate) =>
    navigate({
      to: certificatePath,
      params: { orgId, certificateId: cert.id },
      search: { fromApplication: application.name }
    });

  const columns: DataTableColumn<TCertificate>[] = [
    {
      id: "cn",
      header: "SAN / CN",
      primary: true,
      grow: true,
      text: (cert) => certificateName(cert),
      render: (cert) => (
        <RowLink
          link={{
            to: certificatePath,
            params: { orgId, certificateId: cert.id },
            search: { fromApplication: application.name }
          }}
          title={certificateName(cert)}
        >
          {certificateName(cert)}
        </RowLink>
      )
    },
    {
      id: "status",
      header: "Status",
      width: 176,
      render: (cert) => <CertificateStatusBadge cert={cert} revocation={revocationOf(cert)} />
    },
    {
      id: "issued",
      header: "Issued",
      sortable: true,
      width: 112,
      render: (cert) => shortDate(cert.notBefore)
    },
    {
      id: "expires",
      header: "Expires",
      sortable: true,
      width: 184,
      render: (cert) => (
        <Inline gap={8} align="center" wrap={false}>
          {shortDate(cert.notAfter)}
          <ExpiryBadge cert={cert} />
        </Inline>
      )
    },
    {
      id: "profile",
      header: "Profile",
      width: 144,
      mono: true,
      text: (cert) => cert.profileName ?? "",
      render: (cert) => cert.profileName ?? "None"
    },
    {
      id: "ca",
      header: "CA",
      width: 176,
      text: (cert) => cert.caName ?? "",
      render: (cert) => cert.caName ?? "None"
    }
  ];

  const clear = () => {
    setQuery("");
    setFilters([]);
    setIncludeDeleted(false);
    setActiveViewId(null);
    setViewScope(undefined);
    setPage(1);
  };
  const applyView = (viewId: string | null, view: InventoryView) => {
    setActiveViewId(viewId);
    setFilters(view.filters);
    setIncludeDeleted(view.includeDeleted);
    setViewScope(view.scope);
    setPage(1);
  };

  return (
    <Stack gap="toolbar">
      <FilterBar
        label="Certificate filters"
        fields={inventoryFields(
          authorities,
          profiles.map((profile) => ({ value: profile.profileId, label: profile.profileSlug }))
        )}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setActiveViewId(null);
          setViewScope(undefined);
          setPage(1);
        }}
        search={
          <Input
            icon="search"
            aria-label="Search certificates"
            placeholder="Search by SAN, CN, ID or serial number"
            slashShortcut
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          <>
            <InventoryViewsMenu
              projectId={projectId}
              applicationId={application.id}
              applicationPermission={access.permission}
              activeViewId={activeViewId}
              current={{ filters, includeDeleted, scope: viewScope }}
              onSelect={applyView}
            />
            <Button
              variant="outline"
              icon="upload"
              disabledReason={canImport ? undefined : RESTRICTED}
              onClick={() => setImporting(true)}
            >
              Import
            </Button>
          </>
        }
      />
      {importing && (
        <ImportCertificatesSheet
          applicationId={application.id}
          onClose={() => setImporting(false)}
        />
      )}
      <DataTable
        filtered={filtered}
        label={`Certificates in ${application.name}`}
        rows={rows}
        loading={isPending}
        columns={columns}
        getRowId={(cert) => cert.id}
        rowLabel={(cert) => certificateName(cert)}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        rowActions={{
          renderMenu: (cert) => {
            const revocation = revocationOf(cert);
            const blocks = certificateBlocks(cert, {
              isInventoryView: false,
              caType: caType(cert),
              revocation
            });
            const revokeBlocked =
              blocks.revoke ??
              getApplicationCertificateAccess({
                applicationName: application.name,
                permission: access.permission,
                isRevocationApprovalRequired: revocation.isRevocationApprovalRequired
              }).revokeBlockedReason;
            const deleteBlocked = blocks.delete ?? certificateAccess.deleteBlockedReason;
            return (
              <>
                <DropdownMenuItem onSelect={() => open(cert)}>
                  <Icon name="eye" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(revokeBlocked)}
                  description={revokeBlocked ?? revocation.revokeReplacesRequestReason}
                  onSelect={() => setRevoking(cert)}
                >
                  <Icon name="x" />
                  {revocation.isRevocationApprovalRequired
                    ? "Request revocation"
                    : "Revoke certificate"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(deleteBlocked)}
                  description={deleteBlocked}
                  onSelect={() => setDeleting(cert)}
                >
                  <Icon name="trash" />
                  Delete certificate
                </DropdownMenuItem>
              </>
            );
          }
        }}
        empty={
          filtered ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No certificates match"
              actions={
                <Button variant="link" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              icon="cert"
              title="No certificates yet"
              description="Certificates issued through this application's profiles show up here."
            />
          )
        }
        persistentStatus={
          totalCount ? plural(totalCount, "certificate", "certificates") : undefined
        }
        pagination={
          showPagination(totalCount) ? (
            <Pagination
              label="Certificate pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={totalCount}
              pageSize={pageSize}
              pageSizeOptions={[25, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      <RevokeCertificateDialog
        cert={revoking}
        isRevocationApprovalRequired={Boolean(
          revoking && revocationOf(revoking).isRevocationApprovalRequired
        )}
        onClose={() => setRevoking(undefined)}
      />
      <DeleteCertificateDialog
        cert={deleting}
        caType={deleting ? caType(deleting) : undefined}
        projectId={projectId}
        onClose={() => setDeleting(undefined)}
      />
    </Stack>
  );
};
