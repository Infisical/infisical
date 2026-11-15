import { useState } from "react";
import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@infisical/cipher/patterns/filter-bar";
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

import { EnrollmentType } from "@app/hooks/api/certificateProfiles/types";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import type { TPkiApplication } from "@app/hooks/api/pkiApplications/types";
import { getApplicationCertificateAccess } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { useV4Adapter } from "../../data/adapters";
import type { TListCertificatesDTO } from "../../data/certificates/contract";
import type { PkiApplicationPermission } from "../../data/pki-applications/contract";
import { v4Path } from "../../links";
import {
  certificateBlocks,
  certificateName,
  CertificateStatusBadge,
  DeleteCertificateDialog,
  ExpiryBadge,
  RevokeCertificateDialog,
  shortDate
} from "../components/certificate";
import { plural } from "./shared";

const certificatePath = v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId");

const enrollmentLabel: Record<EnrollmentType, string> = {
  [EnrollmentType.API]: "API",
  [EnrollmentType.EST]: "EST",
  [EnrollmentType.ACME]: "ACME",
  [EnrollmentType.SCEP]: "SCEP"
};

const filterParams = (filters: FilterBarFilter[]): Partial<TListCertificatesDTO> => {
  const params: Partial<TListCertificatesDTO> = {};
  filters.forEach(({ field, operator, values }) => {
    if (!values.length) return;
    if (field === "notAfter") {
      params[operator === "after" ? "notAfterFrom" : "notAfterTo"] = new Date(values[0]);
      return;
    }
    if (field === "status") params.status = values.join(",");
    if (field === "enrollmentType") params.enrollmentTypes = values;
    if (field === "profileId") params.profileIds = values;
  });
  return params;
};

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
  const { data: profiles = [] } = adapter.useApplicationProfiles(application.id);
  const [query, setQuery] = useState(initialSearch ?? "");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "expires",
    direction: "asc"
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [revoking, setRevoking] = useState<TCertificate>();
  const [deleting, setDeleting] = useState<TCertificate>();
  const { data, isPending } = adapter.useApplicationCertificates({
    projectId,
    applicationId: application.id,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search: query.trim() || undefined,
    ...filterParams(filters),
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

  const fields: FilterBarField[] = [
    {
      key: "status",
      label: "Status",
      type: "multi-select",
      options: [
        { value: CertStatus.ACTIVE, label: "Active" },
        { value: CertStatus.RENEWED, label: "Renewed" },
        { value: CertStatus.EXPIRED, label: "Expired" },
        { value: CertStatus.REVOKED, label: "Revoked" }
      ]
    },
    { key: "notAfter", label: "Expiration date", type: "date" },
    {
      key: "enrollmentType",
      label: "Enrollment method",
      type: "multi-select",
      options: Object.entries(enrollmentLabel).map(([value, label]) => ({ value, label }))
    },
    {
      key: "profileId",
      label: "Profile",
      type: "multi-select",
      options: profiles.map((profile) => ({ value: profile.profileId, label: profile.profileSlug }))
    }
  ];

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
      width: 112,
      render: (cert) => <CertificateStatusBadge cert={cert} />
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
    setPage(1);
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="Certificate filters"
        fields={fields}
        value={filters}
        onChange={(next) => {
          setFilters(next);
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
      />
      <DataTable
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
            const blocks = certificateBlocks(cert, {
              isInventoryView: false,
              caType: caType(cert)
            });
            const revokeBlocked = blocks.revoke ?? certificateAccess.revokeBlockedReason;
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
                  description={revokeBlocked}
                  onSelect={() => setRevoking(cert)}
                >
                  <Icon name="x" />
                  Revoke certificate
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
          totalCount > pageSize ? (
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
      <RevokeCertificateDialog cert={revoking} onClose={() => setRevoking(undefined)} />
      <DeleteCertificateDialog
        cert={deleting}
        caType={deleting ? caType(deleting) : undefined}
        onClose={() => setDeleting(undefined)}
      />
    </Stack>
  );
};
