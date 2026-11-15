import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import type { TPkiApplicationListItem } from "@app/hooks/api/pkiApplications/types";

import { formatDate } from "../../access/roles";
import { saved } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { APPLICATION_DOCS } from "../ApplicationDetailsByIDPage/shared";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { ApplicationDialog, ConfigureProfilesDialog } from "./application-dialogs";

const routeId = v4Path("/organizations/$orgId/cert-manager/applications/");
const detailPath = v4Path("/organizations/$orgId/cert-manager/applications/$applicationName");

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const Page = () => {
  const { orgId } = useParams({ from: routeId });
  const navigate = useNavigate();
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const access = useV4Adapter("certificates").useProjectPermission({ projectId: projectId ?? "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState<TPkiApplicationListItem>();
  const { data, isPending, error } = useV4Adapter("pkiApplications").useApplications({
    search: search.trim() || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize
  });

  if (isResolving) return <Loader size="page" label="Loading applications" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;

  const isAdmin = Boolean(
    access.data?.memberships.some((membership) =>
      membership.roles.some((role) => role.role === "admin")
    )
  );
  const rows = data?.applications ?? [];
  const total = data?.total ?? 0;
  const searching = Boolean(search.trim());

  const columns: DataTableColumn<TPkiApplicationListItem>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (application) => application.name,
      secondary: (application) => application.description || undefined,
      render: (application) => (
        <RowLink
          link={{ to: detailPath, params: { orgId, applicationName: application.name } }}
          title={application.name}
        >
          {application.name}
        </RowLink>
      )
    },
    {
      id: "profiles",
      header: "Profiles",
      width: 112,
      align: "end",
      render: (application) => application.profileCount
    },
    {
      id: "members",
      header: "Members",
      width: 112,
      align: "end",
      render: (application) => application.memberCount
    },
    {
      id: "certificates",
      header: "Certificates",
      width: 128,
      align: "end",
      render: (application) => application.certificateCount
    },
    {
      id: "created",
      header: "Created",
      width: 140,
      render: (application) => formatDate(application.createdAt)
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      icon="apps"
      title="No applications yet"
      description="Create an application to issue certificates for a workload."
      actions={
        isAdmin ? (
          <Button variant="outline" icon="plus" onClick={() => setCreating(true)}>
            Create application
          </Button>
        ) : undefined
      }
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load applications"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (searching)
    empty = (
      <EmptyState
        size="sm"
        icon="search"
        title="No applications match this search"
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
          title="Applications"
          badges={<DocumentationLink href={APPLICATION_DOCS.overview} subject="Applications" />}
          actions={
            <Button
              variant="accent"
              icon="plus"
              disabledReason={isAdmin ? undefined : RESTRICTED}
              onClick={() => setCreating(true)}
            >
              Create application
            </Button>
          }
        />
        <Input
          icon="search"
          aria-label="Search applications"
          placeholder="Search applications by name"
          slashShortcut
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <DataTable
          label="Applications"
          rows={rows}
          columns={columns}
          loading={isPending && !error}
          getRowId={(application) => application.id}
          rowLabel={(application) => application.name}
          empty={empty}
          persistentStatus={total ? plural(total, "application", "applications") : undefined}
          rowActions={{
            renderMenu: (application) => (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(application.id).catch(() => undefined);
                    saved("Application ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy application ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isAdmin}
                  description={isAdmin ? undefined : RESTRICTED}
                  onSelect={() => setConfiguring(application)}
                >
                  <Icon name="settings" />
                  Configure profiles
                </DropdownMenuItem>
              </>
            )
          }}
          pagination={
            total > pageSize ? (
              <Pagination
                label="Application pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={total}
                pageSize={pageSize}
                pageSizeOptions={[20, 50, 100]}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
              />
            ) : undefined
          }
        />
      </Stack>
      <ApplicationDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) =>
          navigate({
            to: detailPath,
            params: { orgId, applicationName: created.name },
            search: { selectedTab: "settings" }
          })
        }
      />
      <ConfigureProfilesDialog
        application={configuring}
        onClose={() => setConfiguring(undefined)}
      />
    </TooltipProvider>
  );
};

export const ApplicationsPage = () => (
  <>
    <PageTitle title="Applications" />
    <Page />
  </>
);
