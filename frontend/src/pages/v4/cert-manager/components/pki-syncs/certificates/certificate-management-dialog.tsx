import { useEffect, useRef, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { StatusText } from "@infisical/cipher/ui/text";

import { getCertificateDisplayName } from "@app/helpers/pkiSyncs";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import type { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { formatDate } from "../../../../access/roles";
import { toast } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { usePkiSyncOption, usePkiSyncScope } from "../shared";

import styles from "./dialogs.module.css";

const PAGE_SIZE = 10;

const isExpired = (cert: TCertificate) => new Date(cert.notAfter) < new Date();

const columns: DataTableColumn<TCertificate>[] = [
  {
    id: "name",
    header: "SAN / CN",
    primary: true,
    grow: true,
    mono: true,
    text: (cert) => getCertificateDisplayName(cert).originalDisplayName,
    render: (cert) => getCertificateDisplayName(cert).originalDisplayName
  },
  {
    id: "serial",
    header: "Serial number",
    width: 140,
    render: (cert) => <MiddleTruncate mono keepEnd={4} text={cert.serialNumber} />
  },
  {
    id: "issued",
    header: "Issued",
    width: 120,
    text: (cert) => formatDate(cert.notBefore),
    render: (cert) => formatDate(cert.notBefore)
  },
  {
    id: "expires",
    header: "Expires",
    width: 130,
    render: (cert) =>
      isExpired(cert) ? (
        <StatusText tone="bad" size="sm" icon="alert-c">
          {formatDate(cert.notAfter)}
        </StatusText>
      ) : (
        formatDate(cert.notAfter)
      )
  }
];

export const CertificateManagementDialog = ({
  onClose,
  destination,
  applicationId,
  selectedOrderIds = [],
  maxSelectable,
  onOrderSelectionChange,
  title = "Manage certificate sync",
  description = "Select which certificates should be synced.",
  saveLabel = "Save changes"
}: {
  onClose: () => void;
  destination?: PkiSync;
  applicationId?: string;
  selectedOrderIds?: string[];
  maxSelectable?: number;
  onOrderSelectionChange?: (orderIds: string[], orderNames: [string, string][]) => void;
  title?: string;
  description?: string;
  saveLabel?: string;
}) => {
  const { projectId } = usePkiSyncScope();
  const { syncOption } = usePkiSyncOption(destination as PkiSync);
  const selectionLimit = maxSelectable ?? syncOption?.maxCertificates;
  const isSingleSelect = selectionLimit === 1;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(selectedOrderIds);
  const orderNamesSeen = useRef(new Map<string, string>());

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const { data, isPending } = useV4Adapter("certificates").useCertificates({
    projectId,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    commonName: debouncedSearch || undefined,
    friendlyName: debouncedSearch || undefined,
    forPkiSync: true,
    applicationId
  });
  const certificates = data?.certificates ?? [];
  const totalCount = data?.totalCount ?? 0;

  useEffect(() => {
    data?.certificates.forEach((cert) => {
      if (cert.orderId) orderNamesSeen.current.set(cert.orderId, cert.commonName);
    });
  }, [data]);

  const selectionBlock = (cert: TCertificate) => {
    if (!cert.orderId) return "This certificate has no certificate order";
    if (selectedOrderIds.includes(cert.orderId)) return undefined;
    if (cert.status === CertStatus.REVOKED) return "Revoked certificates can't be synced";
    if (isExpired(cert)) return "Expired certificates can't be synced";
    return undefined;
  };

  const changeSelection = (nextRowIds: string[]) => {
    const pageOrderIds = certificates
      .map((cert) => cert.orderId)
      .filter((orderId): orderId is string => Boolean(orderId));
    const nextPageOrderIds = new Set(
      certificates
        .filter((cert) => cert.orderId && nextRowIds.includes(cert.id))
        .map((cert) => cert.orderId as string)
    );
    const kept = selected.filter((id) => !pageOrderIds.includes(id) || nextPageOrderIds.has(id));
    const added = [...nextPageOrderIds].filter((id) => !selected.includes(id));

    if (!added.length) {
      setSelected(kept);
      return;
    }
    if (isSingleSelect) {
      setSelected([added[0]]);
      return;
    }
    const next = [...kept, ...added];
    if (selectionLimit === undefined || next.length <= selectionLimit) {
      setSelected(next);
      return;
    }
    if (added.length === 1) {
      toast({
        tone: "bad",
        title: `This sync holds at most ${selectionLimit} certificates. Deselect one first.`
      });
      return;
    }
    toast({
      tone: "bad",
      title: `This sync holds at most ${selectionLimit} certificates. Only the first ${selectionLimit} were selected.`
    });
    setSelected(next.slice(0, selectionLimit));
  };

  const save = () => {
    const orderNames = selected
      .filter((orderId) => orderNamesSeen.current.has(orderId))
      .map(
        (orderId) => [orderId, orderNamesSeen.current.get(orderId) as string] as [string, string]
      );
    onOrderSelectionChange?.(selected, orderNames);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.wide}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Stack gap={12}>
          <Input
            icon="search"
            aria-label="Search certificates"
            placeholder="Search by common name, serial number, or SAN"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            trailing={
              search ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  icon="x"
                  iconOnly
                  onClick={() => setSearch("")}
                >
                  Clear search
                </Button>
              ) : undefined
            }
          />
          <DataTable
            label="Certificates"
            rows={certificates}
            columns={columns}
            loading={isPending}
            loadingRows={4}
            getRowId={(cert) => cert.id}
            rowLabel={(cert) => getCertificateDisplayName(cert).originalDisplayName}
            selectable
            selectedIds={certificates
              .filter((cert) => cert.orderId && selected.includes(cert.orderId))
              .map((cert) => cert.id)}
            onSelectionChange={changeSelection}
            selectionDisabledReason={selectionBlock}
            empty={
              <EmptyState
                size="sm"
                media="bare"
                icon={search ? "search" : "cert"}
                title={
                  search
                    ? "No certificates match your search"
                    : "No certificates available for sync"
                }
              />
            }
            pagination={
              totalCount > PAGE_SIZE ? (
                <Pagination
                  label="Certificate pages"
                  variant="compact"
                  page={page}
                  onPageChange={setPage}
                  total={totalCount}
                  pageSize={PAGE_SIZE}
                />
              ) : undefined
            }
          />
        </Stack>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
