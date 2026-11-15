import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Toggle } from "@infisical/cipher/ui/toggle";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import type { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useDebounce } from "@app/hooks/useDebounce";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { AgentVaultDocs, useIsAgentVaultAdmin } from "../resources/agent-vault-utils";
import { PersonalValuesDialog } from "../resources/personal-values-dialog";
import { editUnavailableReason } from "../resources/service-form";
import { ServiceSheet } from "../resources/service-sheet";
import { ServicesTable } from "../resources/services-table";

const route = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/services");
const TABLE = "agentVaultServicesTable";
const ORDER_BY: Record<string, "name" | "type" | "createdAt"> = {
  name: "name",
  type: "type",
  createdAt: "createdAt"
};
const DEFAULT_SORT = { columnId: "name", direction: "asc" as "asc" | "desc" };

const Services = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const resources = useV4Adapter("agentVaultResources");
  const navigate = useNavigate();
  const { requiresSetup } = useSearch({ from: route });
  const onlyRequiringSetup = Boolean(requiresSetup);
  const { isAdmin, isPending: isRolePending } = useIsAgentVaultAdmin(projectId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );
  const [sheet, setSheet] = useState<{ service?: TAgentVaultService }>();
  const [settingUp, setSettingUp] = useState<TAgentVaultService>();
  useAgentVaultCreateIntent(() => setSheet({}), isAdmin);

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
      icon="globe"
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
  else if (isAdmin)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="globe"
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
            isAdmin ? (
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
        <Inline gap={8} wrap={false}>
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
          <Toggle
            variant="outline"
            pressed={onlyRequiringSetup}
            onPressedChange={setRequiringSetup}
          >
            <Icon name="alert" />
            Requires setup
          </Toggle>
        </Inline>
        <ServicesTable
          orgId={orgId}
          projectId={projectId}
          services={services}
          canManage={isAdmin}
          loading={isPending || isRolePending}
          sort={sort}
          onSortChange={(next) => {
            setSort(next.columnId in ORDER_BY ? next : DEFAULT_SORT);
            setPage(1);
          }}
          empty={empty}
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
                  setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
                }}
              />
            ) : undefined
          }
          editDisabledReason={editUnavailableReason}
          onEdit={(service) => setSheet({ service })}
          onSetUp={setSettingUp}
        />
      </Stack>
      {isAdmin && sheet && (
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
