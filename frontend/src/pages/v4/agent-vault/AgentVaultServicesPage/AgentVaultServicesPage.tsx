import { useState } from "react";
import { FilterBar, type FilterBarField } from "@infisical/cipher/patterns/filter-bar";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { canManageAgentVaultServices } from "@app/helpers/agentVaultPermissions";
import type { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useDebounce } from "@app/hooks/useDebounce";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";

import { useProjectPermission } from "../../access/permissions";
import { usePageSize } from "../../components/use-page-size";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { AgentVaultDocs } from "../resources/agent-vault-utils";
import { PersonalValuesDialog } from "../resources/personal-values-dialog";
import { ServiceSheet } from "../resources/service-sheet";
import { ServicesTable } from "../resources/services-table";

const route = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/services");
const TABLE = "agentVaultServicesTable";
const ORDER_BY: Record<string, "name" | "type" | "createdAt"> = {
  name: "name",
  type: "type",
  createdAt: "createdAt"
};
const FILTER_FIELDS: FilterBarField[] = [
  {
    key: "setup",
    label: "Setup",
    type: "select",
    options: [{ value: "requires-setup", label: "Requires setup" }]
  }
];
const DEFAULT_SORT = { columnId: "name", direction: "asc" as "asc" | "desc" };

const Services = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const resources = useV4Adapter("agentVaultResources");
  const navigate = useNavigate();
  const { requiresSetup } = useSearch({ from: route });
  const onlyRequiringSetup = Boolean(requiresSetup);
  const { permission, isPending: isPermissionPending } = useProjectPermission(projectId);
  const canManageServices = canManageAgentVaultServices(permission);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = usePageSize(TABLE, 20);
  const [sheet, setSheet] = useState<{ service?: TAgentVaultService }>();
  const [settingUp, setSettingUp] = useState<TAgentVaultService>();
  useAgentVaultCreateIntent(() => setSheet({}), canManageServices);

  const setRequiringSetup = (next: boolean) => {
    navigate({
      to: route,
      params: { orgId, projectId },
      search: (prev) => ({ ...prev, requiresSetup: next || undefined }),
      replace: true
    });
    setPage(1);
  };

  const { data, isPending } = resources.useServices(projectId, {
    search: debouncedSearch.trim() || undefined,
    requiresSetup: onlyRequiringSetup || undefined,
    orderBy: ORDER_BY[sort.columnId] ?? "name",
    orderDirection: sort.direction,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const { data: requiringSetup } = resources.useServices(projectId, {
    requiresSetup: true,
    granted: true,
    limit: 1
  });
  const services = data?.services ?? [];
  const totalCount = data?.totalCount ?? 0;
  const requiringSetupCount = requiringSetup?.totalCount ?? 0;
  const firstRequiringSetup = requiringSetup?.services[0];
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  const isFiltered = Boolean(debouncedSearch.trim()) || onlyRequiringSetup;
  let empty = (
    <EmptyState
      size="sm"
      media="bare"
      icon="proxy"
      title="No services yet"
      description="No access bundle granted to you holds a service yet. Ask an admin to grant you one."
    />
  );
  if (isFiltered)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No services match these filters"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setRequiringSetup(false);
            }}
          >
            Clear filters
          </Button>
        }
      />
    );
  else if (canManageServices)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="proxy"
        title="No services yet"
        description="Add a service for each API, MCP server, database or SSH server agents need."
        actions={
          <Button variant="outline" icon="plus" onClick={() => setSheet({})}>
            Add service
          </Button>
        }
      />
    );

  return (
    <TooltipProvider>
      <PageTitle title="Services" />
      <Stack gap={24}>
        <PageHeader
          title="Services"
          badges={<DocumentationLink href={AgentVaultDocs.services} subject="services" />}
          actions={
            canManageServices ? (
              <Button variant="accent" icon="plus" onClick={() => setSheet({})}>
                Add service
              </Button>
            ) : undefined
          }
        />
        {requiringSetupCount > 0 && firstRequiringSetup && (
          <Alert
            tone="warn"
            actions={
              onlyRequiringSetup ? undefined : (
                <Button variant="outline" size="sm" onClick={() => setRequiringSetup(true)}>
                  View services
                </Button>
              )
            }
          >
            {`${
              requiringSetupCount === 1
                ? `${firstRequiringSetup.name} requires your personal values.`
                : `${requiringSetupCount} services require your personal values.`
            } Your sessions can't reach ${requiringSetupCount === 1 ? "it" : "them"} until you set ${requiringSetupCount === 1 ? "it" : "them"} up.`}
          </Alert>
        )}
        <FilterBar
          label="Service filters"
          searchValue={search}
          fields={FILTER_FIELDS}
          value={onlyRequiringSetup ? [{ field: "setup", values: ["requires-setup"] }] : []}
          onChange={(next) => setRequiringSetup(next.some((filter) => filter.field === "setup"))}
          search={
            <Input
              icon="search"
              aria-label="Search services"
              placeholder="Search services..."
              slashShortcut
              maxLength={255}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
        />
        <ServicesTable
          orgId={orgId}
          projectId={projectId}
          services={services}
          canManage={canManageServices}
          loading={isPending || isPermissionPending}
          sort={sort}
          onSortChange={(next) => {
            setSort(next.columnId in ORDER_BY ? next : DEFAULT_SORT);
            setPage(1);
          }}
          empty={empty}
          filtered={isFiltered}
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Service pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(next) => {
                  setPerPage(next);
                  setPage(1);
                }}
              />
            ) : undefined
          }
          onEdit={(service) => setSheet({ service })}
          onSetUp={setSettingUp}
        />
      </Stack>
      {canManageServices && sheet && (
        <ServiceSheet
          key={sheet.service?.id ?? "new"}
          projectId={projectId}
          service={sheet.service}
          onOpenChange={(open) => !open && setSheet(undefined)}
        />
      )}
      <PersonalValuesDialog
        projectId={projectId}
        service={settingUp && (services.find(({ id }) => id === settingUp.id) ?? settingUp)}
        onOpenChange={(open) => !open && setSettingUp(undefined)}
      />
    </TooltipProvider>
  );
};

export const AgentVaultServicesPage = () => {
  const { orgId, projectId } = useParams({ from: route });
  return <Services key={projectId} orgId={orgId} projectId={projectId} />;
};
