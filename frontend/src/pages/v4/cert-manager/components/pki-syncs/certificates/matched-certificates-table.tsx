import type { ReactNode } from "react";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Meta, StatusText } from "@infisical/cipher/ui/text";

import { getCertificateDisplayName } from "@app/helpers/pkiSyncs";

import { formatDate } from "../../../../access/roles";

export const MATCHED_PAGE_SIZE = 20;

export type TMatchedCertificateRow = {
  id: string;
  commonName: string;
  altNames?: string | null;
  serialNumber?: string | null;
  notAfter?: string | null;
  profileName?: string | null;
};

const isExpired = (row: TMatchedCertificateRow) =>
  row.notAfter ? new Date(row.notAfter) < new Date() : false;

const columns: DataTableColumn<TMatchedCertificateRow>[] = [
  {
    id: "name",
    header: "SAN / CN",
    primary: true,
    grow: true,
    text: (row) => getCertificateDisplayName(row).originalDisplayName,
    render: (row) => getCertificateDisplayName(row).originalDisplayName
  },
  {
    id: "serial",
    header: "Serial number",
    width: 160,
    render: (row) =>
      row.serialNumber ? (
        <MiddleTruncate mono keepEnd={4} text={row.serialNumber} />
      ) : (
        <Meta>-</Meta>
      )
  },
  {
    id: "profile",
    header: "Profile",
    width: 160,
    text: (row) => row.profileName ?? "-",
    render: (row) => row.profileName ?? "-"
  },
  {
    id: "expires",
    header: "Expires",
    width: 140,
    render: (row) => {
      if (!row.notAfter) return <Meta>-</Meta>;
      if (isExpired(row))
        return (
          <StatusText tone="bad" size="sm" icon="alert-c">
            {formatDate(row.notAfter)}
          </StatusText>
        );
      return formatDate(row.notAfter);
    }
  }
];

export const PkiSyncMatchedCertificatesTable = ({
  rows,
  loading,
  totalCount,
  page,
  onPageChange,
  emptyTitle,
  emptyDescription,
  status
}: {
  rows: readonly TMatchedCertificateRow[];
  loading: boolean;
  totalCount: number;
  page: number;
  onPageChange: (page: number) => void;
  emptyTitle: string;
  emptyDescription: string;
  status?: ReactNode;
}) => (
  <DataTable
    label="Matched certificates"
    rows={rows}
    columns={columns}
    loading={loading}
    loadingRows={3}
    getRowId={(row) => row.id}
    rowLabel={(row) => getCertificateDisplayName(row).originalDisplayName}
    persistentStatus={status}
    empty={
      <EmptyState
        size="sm"
        media="bare"
        icon="cert"
        title={emptyTitle}
        description={emptyDescription}
      />
    }
    pagination={
      totalCount > MATCHED_PAGE_SIZE ? (
        <Pagination
          label="Matched certificate pages"
          variant="compact"
          page={page}
          onPageChange={onPageChange}
          total={totalCount}
          pageSize={MATCHED_PAGE_SIZE}
        />
      ) : undefined
    }
  />
);
