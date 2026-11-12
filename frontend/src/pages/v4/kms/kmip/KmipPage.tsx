import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import { KmipUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  ProjectPermissionKmipActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  type KmipClientCertificate,
  KmipClientOrderBy,
  type TKmipClient
} from "@app/hooks/api/kmip/types";

import { useDebounced } from "../../access/org/use-debounced";
import { useOrgId, useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { UpgradeGate } from "../../license";
import { KmipCertificateDialog } from "./certificate-dialog";
import { KmipCertificateSheet } from "./certificate-sheet";
import { KmipClientSheet, kmipPermissionLabels } from "./client-sheet";
import { KMIP_CLIENT_DOCS } from "./shared";

import css from "./kmip.module.css";

type Overlay =
  | { kind: "client"; client?: TKmipClient }
  | { kind: "certificate"; client: TKmipClient }
  | { kind: "issued"; certificate: KmipClientCertificate }
  | { kind: "delete"; client: TKmipClient }
  | { kind: "upgrade" };

export const KmipPage = () => {
  const { projectId } = useParams({
    from: "/v4/organizations/$orgId/projects/kms/$projectId/kmip"
  });
  const orgId = useOrgId();
  const kmip = useV4Adapter("kmip");
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const { data: hasPlan } = kmip.useHasKmipPlan(orgId);
  const remove = kmip.useDeleteClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("kmipClientTable", PreferenceKey.PerPage, 20)
  );
  const [overlay, setOverlay] = useState<Overlay>();
  const canRead = permission.can(
    ProjectPermissionKmipActions.ReadClients,
    ProjectPermissionSub.Kmip
  );
  const { data, isPending, error } = kmip.useClients({
    projectId: canRead ? projectId : "",
    offset: (page - 1) * perPage,
    limit: perPage,
    search: debouncedSearch,
    orderBy: KmipClientOrderBy.Name,
    orderDirection: direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC
  });
  const clients = data?.kmipClients ?? [];
  const totalCount = data?.totalCount ?? 0;

  useEffect(() => {
    if (totalCount > 0 && (page - 1) * perPage >= totalCount)
      setPage(Math.ceil(totalCount / perPage));
  }, [totalCount, page, perPage]);

  if (permissionPending) return <Loader size="page" label="Loading KMIP clients" />;

  const can = (action: ProjectPermissionKmipActions) =>
    permission.can(action, ProjectPermissionSub.Kmip);
  const canCreate = can(ProjectPermissionKmipActions.CreateClients);
  const canEdit = can(ProjectPermissionKmipActions.UpdateClients);
  const canDelete = can(ProjectPermissionKmipActions.DeleteClients);
  const canIssue = can(ProjectPermissionKmipActions.GenerateClientCertificates);

  const columns: DataTableColumn<TKmipClient>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      width: 220,
      render: (client) => client.name
    },
    {
      id: "description",
      header: "Description",
      grow: true,
      render: (client) => client.description?.trim() || <span className={css.muted}>-</span>
    },
    {
      id: "permissions",
      header: "Permissions",
      grow: true,
      render: (client) =>
        client.permissions.length ? (
          client.permissions.map((entry) => kmipPermissionLabels[entry] ?? entry).join(", ")
        ) : (
          <span className={css.muted}>-</span>
        )
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      icon="machine"
      title="No KMIP clients yet"
      description="Add a KMIP client to grant a device or application access to this project's keys."
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load KMIP clients"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (debouncedSearch)
    empty = (
      <EmptyState
        size="sm"
        icon="search"
        title="No KMIP clients match this search"
        actions={
          <Button variant="link" onClick={() => setSearch("")}>
            Clear search
          </Button>
        }
      />
    );

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="KMIP"
          description="Connect KMIP-compatible devices and applications to this project's keys."
          badges={<DocumentationLinkBadge href={KMIP_CLIENT_DOCS} />}
          actions={
            canRead ? (
              <Button
                variant="accent"
                icon="plus"
                disabledReason={canCreate ? undefined : RESTRICTED}
                onClick={() =>
                  setOverlay(hasPlan === false ? { kind: "upgrade" } : { kind: "client" })
                }
              >
                Add KMIP client
              </Button>
            ) : undefined
          }
        />
        {canRead ? (
          <>
            <Input
              icon="search"
              aria-label="Search KMIP clients by name"
              placeholder="Search KMIP clients by name"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <DataTable
              label="KMIP clients"
              rows={clients}
              columns={columns}
              loading={isPending && !error}
              getRowId={(client) => client.id}
              rowLabel={(client) => client.name}
              sort={{ columnId: "name", direction }}
              onSortChange={(next) => {
                setDirection(next.direction);
                setPage(1);
              }}
              empty={empty}
              rowActions={{
                inline: [
                  {
                    label: "Generate certificate",
                    icon: "cert",
                    disabledReason: () => (canIssue ? undefined : RESTRICTED),
                    onSelect: (client) => setOverlay({ kind: "certificate", client })
                  }
                ],
                renderMenu: (client) => (
                  <>
                    <DropdownMenuItem
                      disabled={!canEdit}
                      description={canEdit ? undefined : RESTRICTED}
                      onSelect={() => setOverlay({ kind: "client", client })}
                    >
                      <Icon icon={PencilIcon} />
                      Edit KMIP client
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!canDelete}
                      description={canDelete ? undefined : RESTRICTED}
                      onSelect={() => setOverlay({ kind: "delete", client })}
                    >
                      <Icon name="trash" />
                      Delete KMIP client
                    </DropdownMenuItem>
                  </>
                )
              }}
              pagination={
                !isPending && totalCount > 0 ? (
                  <Pagination
                    label="KMIP client pages"
                    variant="compact"
                    page={page}
                    total={totalCount}
                    pageSize={perPage}
                    pageSizeOptions={[10, 20, 50, 100]}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPerPage(size);
                      setPage(1);
                      setUserTablePreference("kmipClientTable", PreferenceKey.PerPage, size);
                    }}
                  />
                ) : undefined
              }
            />
          </>
        ) : (
          <AccessRestricted requirement="read KMIP clients" />
        )}
      </Stack>
      <UpgradeGate
        intent={KmipUpgradeIntent}
        paywallKey="kms.kmip-client"
        isOpen={overlay?.kind === "upgrade"}
        onOpenChange={(open) => !open && setOverlay(undefined)}
      />
      {overlay?.kind === "client" && (
        <KmipClientSheet
          projectId={projectId}
          client={overlay.client}
          onClose={() => setOverlay(undefined)}
        />
      )}
      {overlay?.kind === "certificate" && (
        <KmipCertificateSheet
          client={overlay.client}
          onClose={() =>
            setOverlay((current) => (current?.kind === "issued" ? current : undefined))
          }
          onIssued={(certificate) => setOverlay({ kind: "issued", certificate })}
        />
      )}
      {overlay?.kind === "issued" && (
        <KmipCertificateDialog
          certificate={overlay.certificate}
          onClose={() => setOverlay(undefined)}
        />
      )}
      {overlay?.kind === "delete" && (
        <AlertDialog open onOpenChange={(open) => !open && setOverlay(undefined)}>
          <AlertDialogContent tone="danger" confirmText="confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>{`Delete KMIP client ${overlay.client.name}?`}</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the KMIP client. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  try {
                    await remove.mutateAsync({ id: overlay.client.id, projectId });
                    saved("KMIP client successfully deleted");
                    setOverlay(undefined);
                  } catch (failure) {
                    failed("Failed to delete KMIP client", failure);
                  }
                }}
              >
                Delete KMIP client
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </TooltipProvider>
  );
};
