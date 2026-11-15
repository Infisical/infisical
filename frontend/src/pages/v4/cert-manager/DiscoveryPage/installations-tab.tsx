import { useEffect, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";

import { ProjectPermissionPkiCertificateInstallationActions } from "@app/context/ProjectPermissionContext/types";
import type { TPkiInstallation } from "@app/hooks/api/pkiDiscovery/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";
import {
  canSetKeystorePassword,
  DeleteInstallationDialog,
  DiscoveryTypeIcon,
  EditInstallationDialog,
  installationDiscoveryType,
  installationName,
  KeystorePasswordDialog,
  KeystoreStatusBadge,
  passwordActionLabel,
  RESCAN_POLL_INTERVAL_MS,
  RESCAN_POLL_TIMEOUT_MS,
  timestamp,
  useDiscoveryAccess
} from "./discovery-shared";

type PendingRescan = { installationId: string; previousCheckedAt?: string };

export const InstallationsTab = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const go = useGo();
  const access = useDiscoveryAccess(projectId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<TPkiInstallation>();
  const [deleting, setDeleting] = useState<TPkiInstallation>();
  const [settingPassword, setSettingPassword] = useState<TPkiInstallation>();
  const [pendingRescan, setPendingRescan] = useState<PendingRescan | null>(null);

  useEffect(() => {
    if (!pendingRescan) return undefined;
    const timeout = setTimeout(() => setPendingRescan(null), RESCAN_POLL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [pendingRescan]);

  const { data, isPending, error } = useV4Adapter("pkiDiscovery").useInstallations(
    {
      projectId,
      offset: (page - 1) * pageSize,
      limit: pageSize,
      search: debouncedSearch || undefined
    },
    { refetchInterval: pendingRescan ? RESCAN_POLL_INTERVAL_MS : false }
  );
  const rows = data?.installations ?? [];
  const total = data?.totalCount ?? 0;

  const rescanned = pendingRescan
    ? rows.find((row) => row.id === pendingRescan.installationId)
    : undefined;
  const rescanDone =
    rescanned && rescanned.metadata?.lastCheckedAt !== pendingRescan?.previousCheckedAt;
  if (rescanDone) setPendingRescan(null);

  const can = (action: ProjectPermissionPkiCertificateInstallationActions) =>
    access.installations(action) ? undefined : RESTRICTED;
  const href = (installation: TPkiInstallation) =>
    orgHref(orgId, `/cert-manager/discovery/installations/${installation.id}`);

  const columns: DataTableColumn<TPkiInstallation>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      minWidth: 240,
      text: (installation) => installationName(installation),
      render: (installation) => (
        <Inline gap={8} align="center" wrap={false}>
          <DiscoveryTypeIcon type={installationDiscoveryType(installation)} />
          <RowLink link={go.link(href(installation))} title={installationName(installation)}>
            {installationName(installation)}
          </RowLink>
          <KeystoreStatusBadge installation={installation} />
        </Inline>
      )
    },
    {
      id: "certificate",
      header: "Certificate",
      width: 220,
      text: (installation) => installation.primaryCertName ?? "-",
      render: (installation) => (
        <span title={installation.primaryCertName ?? undefined}>
          {installation.primaryCertName || "-"}
        </span>
      )
    },
    {
      id: "gateway",
      header: "Gateway",
      width: 160,
      render: (installation) => installation.locationDetails.gatewayName || "N/A"
    },
    {
      id: "certs",
      header: "Certs",
      width: 80,
      align: "end",
      render: (installation) =>
        installation.certificatesCount ?? installation.certificates?.length ?? 0
    },
    {
      id: "seen",
      header: "Last seen",
      width: 160,
      render: (installation) => timestamp(installation.lastSeenAt)
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      icon="server"
      title="No installations found"
      description="Run a discovery job to find the certificates served across your infrastructure."
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load installations"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (debouncedSearch)
    empty = (
      <EmptyState
        size="sm"
        icon="search"
        title="No installations match this search"
        actions={
          <Button variant="link" onClick={() => setSearch("")}>
            Clear search
          </Button>
        }
      />
    );

  return (
    <Stack gap={16}>
      <Input
        icon="search"
        aria-label="Search installations"
        placeholder="Search by name, host, IP, domain or path"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      <DataTable
        label="Installations"
        rows={rows}
        columns={columns}
        loading={isPending && !error}
        getRowId={(installation) => installation.id}
        rowLabel={(installation) => installationName(installation)}
        empty={empty}
        persistentStatus={
          total ? `${total} ${total === 1 ? "installation" : "installations"}` : undefined
        }
        rowActions={{
          renderMenu: (installation) => (
            <>
              <DropdownMenuItem
                disabled={Boolean(can(ProjectPermissionPkiCertificateInstallationActions.Edit))}
                description={can(ProjectPermissionPkiCertificateInstallationActions.Edit)}
                onSelect={() => setEditing(installation)}
              >
                <Icon name="pencil" />
                Edit installation
              </DropdownMenuItem>
              {canSetKeystorePassword(installation) && (
                <DropdownMenuItem
                  disabled={!access.canRescan}
                  description={access.canRescan ? undefined : RESTRICTED}
                  onSelect={() => setSettingPassword(installation)}
                >
                  <Icon name="key" />
                  {passwordActionLabel(installation)}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={Boolean(can(ProjectPermissionPkiCertificateInstallationActions.Delete))}
                description={can(ProjectPermissionPkiCertificateInstallationActions.Delete)}
                onSelect={() => setDeleting(installation)}
              >
                <Icon name="trash" />
                Delete installation
              </DropdownMenuItem>
            </>
          )
        }}
        pagination={
          total > pageSize ? (
            <Pagination
              label="Installation pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={total}
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
      <EditInstallationDialog
        installation={editing}
        projectId={projectId}
        onClose={() => setEditing(undefined)}
      />
      <KeystorePasswordDialog
        installation={settingPassword}
        projectId={projectId}
        onClose={() => setSettingPassword(undefined)}
        onSaved={() => {
          if (!settingPassword) return;
          setPendingRescan({
            installationId: settingPassword.id,
            previousCheckedAt: settingPassword.metadata?.lastCheckedAt
          });
        }}
      />
      <DeleteInstallationDialog
        installation={deleting}
        projectId={projectId}
        onClose={() => setDeleting(undefined)}
      />
    </Stack>
  );
};
