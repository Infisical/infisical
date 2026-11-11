import { useState } from "react";
import { NetworkIcon, TriangleAlertIcon } from "lucide-react";

import { PersonalValuesDialog } from "@app/components/agent-vault/PersonalValuesDialog";
import { ServiceSheet } from "@app/components/agent-vault/service-sheet";
import { ServicesCard, ServiceSortColumn } from "@app/components/agent-vault/ServicesCard";
import { PageTitle } from "@app/components/PageTitle";
import { Alert, AlertAction, AlertDescription, Button, PageHeader } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  useListAgentVaultServices,
  useListGrantedAgentVaultServicesRequiringSetup
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const ORDER_BY: Record<ServiceSortColumn, "name" | "type" | "createdAt"> = {
  [ServiceSortColumn.Name]: "name",
  [ServiceSortColumn.Type]: "type",
  // Target isn't sortable on this page, so it never reaches the server.
  [ServiceSortColumn.Target]: "name",
  [ServiceSortColumn.Created]: "createdAt"
};

export const AgentVaultServicesPage = () => {
  const { projectId } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [onlyRequiringSetup, setOnlyRequiringSetup] = useState(false);
  const [sortColumn, setSortColumn] = useState(ServiceSortColumn.Name);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultServicesTable", PreferenceKey.PerPage, 20)
  );

  const { data } = useListAgentVaultServices(projectId, {
    search: debouncedSearch.trim() || undefined,
    requiresSetup: onlyRequiringSetup || undefined,
    orderBy: ORDER_BY[sortColumn],
    orderDirection: sortDirection === "ascending" ? "asc" : "desc",
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  // Counted over the bundles granted to the caller, the same count the sidebar shows.
  const { data: requiringSetup } = useListGrantedAgentVaultServicesRequiringSetup(projectId);
  const requiringSetupCount = requiringSetup?.totalCount ?? 0;
  const firstRequiringSetup = requiringSetup?.services[0];

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<TAgentVaultService | null>(null);
  const [serviceToSetUp, setServiceToSetUp] = useState<TAgentVaultService | null>(null);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Services" />

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={NetworkIcon}
        title="Services"
        description={
          isAdmin
            ? "Define each API, MCP server, database and SSH server once, then add it to the access bundles that need it."
            : "The services your access bundles give you, and the personal values each one needs from you."
        }
      />

      {requiringSetupCount > 0 && firstRequiringSetup && (
        <Alert variant="warning" className="mb-6">
          <TriangleAlertIcon />
          <AlertDescription>
            <p>
              {requiringSetupCount === 1
                ? `${firstRequiringSetup.name} requires your personal values.`
                : `${requiringSetupCount} services require your personal values.`}{" "}
              Your sessions can&apos;t reach {requiringSetupCount === 1 ? "it" : "them"} until you
              set {requiringSetupCount === 1 ? "it" : "them"} up.
            </p>
            <AlertAction>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setServiceToSetUp(firstRequiringSetup)}
              >
                Set Up {firstRequiringSetup.name}
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      <ServicesCard
        services={data?.services ?? []}
        canManage={isAdmin}
        emptyDescription={
          isAdmin
            ? undefined
            : "No access bundle granted to you holds a service yet. Ask an admin to grant you one."
        }
        onAdd={() => {
          setServiceToEdit(null);
          setIsSheetOpen(true);
        }}
        onEdit={(service) => {
          setServiceToEdit(service);
          setIsSheetOpen(true);
        }}
        onSetUp={setServiceToSetUp}
        serverPaging={{
          search,
          onSearchChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          sortColumn,
          sortDirection,
          onSortChange: (column, direction) => {
            if (direction === "none") {
              setSortColumn(ServiceSortColumn.Name);
              setSortDirection("ascending");
            } else {
              setSortColumn(column);
              setSortDirection(direction);
            }
            setPage(1);
          },
          page,
          perPage,
          totalCount,
          onChangePage: setPage,
          onChangePerPage: (newPerPage) => {
            setPerPage(newPerPage);
            setPage(1);
            setUserTablePreference("agentVaultServicesTable", PreferenceKey.PerPage, newPerPage);
          },
          isFiltered: onlyRequiringSetup,
          filters: (
            <Button
              variant={onlyRequiringSetup ? "av" : "outline"}
              onClick={() => {
                setOnlyRequiringSetup((value) => !value);
                setPage(1);
              }}
            >
              <TriangleAlertIcon />
              Requires Setup
            </Button>
          )
        }}
      />

      {isAdmin && (
        <ServiceSheet isOpen={isSheetOpen} onOpenChange={setIsSheetOpen} service={serviceToEdit} />
      )}

      <PersonalValuesDialog
        target={serviceToSetUp ? { service: serviceToSetUp } : null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setServiceToSetUp(null);
        }}
      />
    </div>
  );
};
