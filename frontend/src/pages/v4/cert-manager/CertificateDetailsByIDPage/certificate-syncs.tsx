import { useMemo, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
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
import { Pagination } from "@infisical/cipher/ui/pagination";

import {
  hasAnyFilter,
  isCertificateOrderTheOnlyFilter
} from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";

import { useOrgId } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";
import { destinationNameOf } from "../components/pki-syncs/shared";

import styles from "../components/pki-syncs/certificates/dialogs.module.css";

const PER_PAGE = 10;

const syncUnavailableReason = (sync: TPkiSync) => {
  if (!sync.applicationId) return "Not attached to an application";
  if (!hasAnyFilter(sync.filters)) return "No filters set";
  if (!isCertificateOrderTheOnlyFilter(sync.filters))
    return "Selects certificates by profile or metadata";
  return undefined;
};

const columns: DataTableColumn<TPkiSync>[] = [
  {
    id: "name",
    header: "Name",
    primary: true,
    grow: true,
    text: (sync) => sync.name,
    render: (sync) => sync.name,
    secondary: (sync) => syncUnavailableReason(sync)
  },
  {
    id: "destination",
    header: "Destination",
    width: 200,
    text: (sync) => destinationNameOf(sync.destination),
    render: (sync) => destinationNameOf(sync.destination)
  }
];

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((id) => b.has(id));

const SyncsDialog = ({
  onClose,
  certificate,
  projectId
}: {
  onClose: () => void;
  certificate: TCertificate;
  projectId: string;
}) => {
  const orgId = useOrgId();
  const go = useGo();
  const adapter = useV4Adapter("pkiSyncs");
  const addCertificates = adapter.useAddCertificates();
  const removeCertificates = adapter.useRemoveCertificates();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: pkiSyncs = [], isPending } = adapter.useSyncsWithCertificate(
    projectId,
    certificate.id,
    { enabled: Boolean(projectId) && Boolean(certificate.id) }
  );

  const initial = useMemo(
    () => new Set(pkiSyncs.filter((sync) => sync.hasCertificate).map((sync) => sync.id)),
    [pkiSyncs]
  );
  const selected = picked ?? initial;
  const isDirty = !sameSet(selected, initial);

  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty,
    onDiscard: onClose
  });

  const filteredSyncs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return pkiSyncs;
    return pkiSyncs.filter((sync) => sync.name.toLowerCase().includes(term));
  }, [pkiSyncs, search]);
  const pageSyncs = filteredSyncs.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const syncsHref = certificate.applicationName
    ? orgHref(orgId, `/cert-manager/applications/${certificate.applicationName}?selectedTab=syncs`)
    : orgHref(orgId, "/cert-manager/integrations");

  const save = async () => {
    const syncsToAdd = [...selected].filter((id) => !initial.has(id));
    const syncsToRemove = [...initial].filter((id) => !selected.has(id));
    setIsSubmitting(true);
    try {
      await Promise.all(
        syncsToAdd.map((pkiSyncId) =>
          addCertificates.mutateAsync({ pkiSyncId, certificateIds: [certificate.id] })
        )
      );
      await Promise.all(
        syncsToRemove.map((pkiSyncId) =>
          removeCertificates.mutateAsync({ pkiSyncId, certificateIds: [certificate.id] })
        )
      );
      saved(`Certificate syncs updated for "${certificate.commonName}"`);
      onClose();
    } catch (error) {
      failed("Failed to update certificate syncs", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const empty = () => {
    if (pkiSyncs.length === 0)
      return (
        <EmptyState
          size="sm"
          media="bare"
          icon="link"
          title="No certificate syncs"
          description="Create a certificate sync first to manage certificate syncing."
          actions={
            <Button
              variant="outline"
              onClick={() => {
                go(syncsHref);
                onClose();
              }}
            >
              Go to certificate syncs
            </Button>
          }
        />
      );
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No syncs match"
        description="Try a different search term."
      />
    );
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent className={styles.form} pending={isSubmitting}>
          <DialogHeader>
            <DialogTitle>Manage certificate syncs</DialogTitle>
            <DialogDescription>
              {`Select which syncs "${certificate.commonName}" should be part of.`}
            </DialogDescription>
          </DialogHeader>
          <Stack gap={12}>
            <Input
              icon="search"
              aria-label="Search certificate syncs"
              placeholder="Search syncs by name"
              disabled={isSubmitting}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <DataTable
              label="Certificate syncs"
              rows={pageSyncs}
              columns={columns}
              loading={isPending}
              loadingRows={3}
              getRowId={(sync) => sync.id}
              rowLabel={(sync) => sync.name}
              selectable
              selectedIds={[...selected]}
              onSelectionChange={(ids) => {
                if (!isSubmitting) setPicked(new Set(ids));
              }}
              selectionDisabledReason={syncUnavailableReason}
              isRowMuted={(sync) => Boolean(syncUnavailableReason(sync))}
              empty={empty()}
              pagination={
                filteredSyncs.length > PER_PAGE ? (
                  <Pagination
                    label="Certificate sync pages"
                    variant="compact"
                    page={page}
                    onPageChange={setPage}
                    total={filteredSyncs.length}
                    pageSize={PER_PAGE}
                  />
                ) : undefined
              }
            />
          </Stack>
          <DialogFooter>
            <Button variant="outline" disabled={isSubmitting} onClick={requestDiscard}>
              Cancel
            </Button>
            <Button variant="primary" loading={isSubmitting} onClick={save}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard changes?"
        description="Your certificate sync selection changes will be lost."
      />
    </>
  );
};

export const CertificateSyncsDialog = ({
  open,
  onOpenChange,
  certificate,
  projectId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate: TCertificate;
  projectId: string;
}) =>
  open ? (
    <SyncsDialog
      onClose={() => onOpenChange(false)}
      certificate={certificate}
      projectId={projectId}
    />
  ) : null;
