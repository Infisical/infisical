import { ReactNode, useMemo, useState } from "react";
import { linkOptions } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  KeyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  TriangleAlertIcon,
  UnlinkIcon,
  WebhookIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { nativeTargetText } from "@app/components/agent-vault/nativeServiceMeta";
import { OAuthStatusBadge } from "@app/components/agent-vault/service-sheet/OAuthAuthorizeCard";
import {
  displayHostPattern,
  hostPatternOf,
  isNativeService,
  SERVICE_TYPE_LABELS
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OverflowBadgeList,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  useDeleteAgentVaultService,
  useRemoveAgentVaultAccessBundleService
} from "@app/hooks/api/agentVault";
import { TAgentVaultBundleRef, TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

export enum ServiceSortColumn {
  Name = "name",
  Type = "type",
  Target = "target",
  Created = "created"
}

const targetOf = (service: TAgentVaultService) => {
  if (isNativeService(service)) return nativeTargetText(service);
  return service.type === AgentVaultServiceType.Mcp ? service.serverUrl : service.hostPattern;
};

// The host, not the shown URL, so MCP servers sort among the HTTP hosts instead of together under "https".
const sortTargetOf = (service: TAgentVaultService) =>
  isNativeService(service) ? service.host : service.hostPattern;

const SORT_COMPARATORS: Record<
  ServiceSortColumn,
  (a: TAgentVaultService, b: TAgentVaultService) => number
> = {
  [ServiceSortColumn.Name]: (a, b) => a.name.localeCompare(b.name),
  [ServiceSortColumn.Type]: (a, b) => a.type.localeCompare(b.type),
  [ServiceSortColumn.Target]: (a, b) => sortTargetOf(a).localeCompare(sortTargetOf(b)),
  [ServiceSortColumn.Created]: (a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
};

type TListedService = TAgentVaultService & { accessBundles?: TAgentVaultBundleRef[] };

export type TServicesServerPaging = {
  search: string;
  onSearchChange: (search: string) => void;
  sortColumn: ServiceSortColumn;
  sortDirection: "ascending" | "descending";
  onSortChange: (column: ServiceSortColumn, direction: "ascending" | "descending" | "none") => void;
  page: number;
  perPage: number;
  totalCount: number;
  onChangePage: (page: number) => void;
  onChangePerPage: (perPage: number) => void;
  // Filters the page owns, shown beside the search.
  filters?: ReactNode;
  // Whether a filter other than the search narrows the list, for the empty state.
  isFiltered?: boolean;
};

type Props = {
  // Set on a bundle's page: the services listed are that bundle's, and the row action takes one out of it rather
  // than deleting it from the project.
  accessBundleId?: string;
  services: TListedService[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (service: TListedService) => void;
  onSetUp: (service: TAgentVaultService) => void;
  // Set when the page lists one page of a server-side search and sort, rather than every service at once.
  serverPaging?: TServicesServerPaging;
  emptyDescription?: string;
  // The first load hasn't finished, so an empty list doesn't mean there are no services yet.
  isPending?: boolean;
  // Set when the list couldn't be read, so a failure never looks like an empty project.
  onRetryLoad?: () => void;
};

// Two hosts is what the column fits comfortably; the rest go behind the count so the table keeps its
// width no matter how many a service covers.
const HOSTS_SHOWN = 2;

const HostsCell = ({ hostPattern }: { hostPattern: string }) => {
  const hosts = displayHostPattern(hostPattern).split(", ");
  const hidden = hosts.slice(HOSTS_SHOWN);

  return (
    <div className="flex max-w-72 items-center gap-1.5 text-sm">
      <span className="truncate">{hosts.slice(0, HOSTS_SHOWN).join(", ")}</span>
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger className="shrink-0 text-muted">+{hidden.length}</TooltipTrigger>
          <TooltipContent>{hidden.join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

const TargetCell = ({ service }: { service: TAgentVaultService }) => {
  if (service.type === AgentVaultServiceType.Mcp) {
    return (
      <span className="block max-w-72 truncate text-sm" title={service.serverUrl}>
        {service.serverUrl.replace(/^https:\/\//i, "")}
      </span>
    );
  }
  if (service.type === AgentVaultServiceType.Http) {
    return <HostsCell hostPattern={service.hostPattern} />;
  }
  const target = nativeTargetText(service);
  return (
    <span className="block max-w-72 truncate text-sm" title={target}>
      {target}
    </span>
  );
};

// A connection missing scopes still works for what it was granted, so it stays configured but asks to reconnect.
const PersonalSetupBadge = ({
  personalValues,
  onClick
}: {
  personalValues: NonNullable<TAgentVaultService["personalValues"]>;
  onClick: () => void;
}) => {
  if (!personalValues.isConfigured) {
    return (
      <Badge variant="warning" asChild>
        <button type="button" onClick={onClick}>
          <TriangleAlertIcon />
          Requires Setup
        </button>
      </Badge>
    );
  }
  if (
    personalValues.fields.some(
      (field) => field.oauth?.status === AgentVaultOauthStatus.NeedsAdditionalScopes
    )
  ) {
    return (
      <Badge variant="warning" asChild>
        <button type="button" onClick={onClick}>
          <TriangleAlertIcon />
          Missing Scopes
        </button>
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" asChild>
      <button type="button" onClick={onClick}>
        <CircleCheckIcon />
        Configured
      </button>
    </Badge>
  );
};

export const ServicesCard = ({
  accessBundleId,
  services,
  canManage,
  onAdd,
  onEdit,
  onSetUp,
  serverPaging,
  emptyDescription: emptyDescriptionOverride,
  isPending = false,
  onRetryLoad
}: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const [localSearch, setLocalSearch] = useState("");
  const search = serverPaging?.search ?? localSearch;
  const setSearch = serverPaging?.onSearchChange ?? setLocalSearch;
  const [serviceToDelete, setServiceToDelete] = useState<TListedService | null>(null);
  const deleteService = useDeleteAgentVaultService(projectId);
  const removeService = useRemoveAgentVaultAccessBundleService(projectId);
  const isBundle = Boolean(accessBundleId);

  const [localSortColumn, setSortColumn] = useState(ServiceSortColumn.Created);
  const [localSortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");
  const sortColumn = serverPaging?.sortColumn ?? localSortColumn;
  const sortDirection = serverPaging?.sortDirection ?? localSortDirection;

  const displayed = useMemo(() => {
    if (serverPaging) return services;
    const term = search.trim().toLowerCase();
    // A bundle holds few services, so the type is matched by search ("mcp", "http") rather than a filter.
    const filtered = services.filter((service) =>
      [
        service.name,
        service.description ?? "",
        hostPatternOf(service) ?? "",
        targetOf(service),
        service.type,
        SERVICE_TYPE_LABELS[service.type]
      ].some((text) => text.toLowerCase().includes(term))
    );

    const ordered = [...filtered].sort(SORT_COMPARATORS[sortColumn]);
    return sortDirection === "ascending" ? ordered : ordered.reverse();
  }, [services, search, sortColumn, sortDirection, serverPaging]);

  const handleSort = (
    column: ServiceSortColumn,
    direction: "ascending" | "descending" | "none"
  ) => {
    if (serverPaging) {
      serverPaging.onSortChange(column, direction);
      return;
    }
    if (direction === "none") {
      setSortColumn(ServiceSortColumn.Created);
      setSortDirection("descending");
      return;
    }
    setSortColumn(column);
    setSortDirection(direction);
  };

  const sortIconClassName = (column: ServiceSortColumn) =>
    twMerge(
      "size-3.5 transition-transform",
      sortColumn === column && sortDirection === "descending" && "rotate-180",
      sortColumn !== column && "opacity-30"
    );

  const hasAny = serverPaging
    ? serverPaging.totalCount > 0 ||
      Boolean(serverPaging.search.trim()) ||
      Boolean(serverPaging.isFiltered)
    : services.length > 0;
  const isNarrowed = serverPaging
    ? Boolean(serverPaging.search.trim()) || Boolean(serverPaging.isFiltered)
    : Boolean(search.trim());
  let emptyDescription = "Try a different search term or filter.";
  if (!isNarrowed && emptyDescriptionOverride) emptyDescription = emptyDescriptionOverride;
  else if (!isNarrowed) {
    emptyDescription = isBundle
      ? "Add services to give this bundle access to external hosts."
      : "Add a service for each API, MCP server, database or SSH server agents need.";
  }

  const handleDelete = async () => {
    try {
      if (!serviceToDelete) return;

      if (accessBundleId) {
        await removeService.mutateAsync({ accessBundleId, serviceId: serviceToDelete.id });
      } else {
        await deleteService.mutateAsync({ serviceId: serviceToDelete.id });
      }
      createNotification({
        text: accessBundleId
          ? `Service "${serviceToDelete.name}" removed from this bundle`
          : `Service "${serviceToDelete.name}" deleted`,
        type: "success"
      });
      setServiceToDelete(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Services
          <DocumentationLinkBadge href={AgentVaultDocsUrls.services} />
        </CardTitle>
        <CardDescription>
          {isBundle
            ? "The services agents can reach with this bundle. Each one is defined once in the project and can be in any number of bundles."
            : `A service defines one API, MCP server, database or SSH server the agent can reach, and the credential the proxy uses for it.${canManage ? " Add it to access bundles to give agents access." : ""}`}
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="av" onClick={onAdd}>
              <PlusIcon />
              Add Service
            </Button>
          </CardAction>
        )}
      </CardHeader>

      {hasAny && (
        <CardContent className="flex gap-2">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search services"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services..."
            />
          </InputGroup>
          {serverPaging?.filters}
        </CardContent>
      )}

      {onRetryLoad && (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Couldn&apos;t load services</EmptyTitle>
              <EmptyDescription>Check your connection and try again.</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={onRetryLoad}>
              Try Again
            </Button>
          </Empty>
        </CardContent>
      )}
      {!onRetryLoad && !isPending && displayed.length === 0 && (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {isNarrowed ? "No services match your search" : "No services yet"}
              </EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
            {canManage && !isNarrowed && (
              <Button variant="av" onClick={onAdd}>
                <PlusIcon />
                Add Service
              </Button>
            )}
          </Empty>
        </CardContent>
      )}
      {!onRetryLoad && (isPending || displayed.length > 0) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                isTruncatable
                className="w-2/5"
                sortDirection={sortColumn === ServiceSortColumn.Name ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(ServiceSortColumn.Name, direction)}
              >
                Name
                <ChevronDownIcon className={sortIconClassName(ServiceSortColumn.Name)} />
              </TableHead>
              <TableHead
                sortDirection={sortColumn === ServiceSortColumn.Type ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(ServiceSortColumn.Type, direction)}
              >
                Type
                <ChevronDownIcon className={sortIconClassName(ServiceSortColumn.Type)} />
              </TableHead>
              {serverPaging ? (
                <TableHead>Target</TableHead>
              ) : (
                <TableHead
                  sortDirection={sortColumn === ServiceSortColumn.Target ? sortDirection : "none"}
                  onSortChange={(direction) => handleSort(ServiceSortColumn.Target, direction)}
                >
                  Target
                  <ChevronDownIcon className={sortIconClassName(ServiceSortColumn.Target)} />
                </TableHead>
              )}
              {!isBundle && <TableHead>Access Bundles</TableHead>}
              <TableHead
                sortDirection={sortColumn === ServiceSortColumn.Created ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(ServiceSortColumn.Created, direction)}
              >
                Created
                <ChevronDownIcon className={sortIconClassName(ServiceSortColumn.Created)} />
              </TableHead>
              <TableHead className="w-0" />
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`service-skeleton-${index}`}>
                  {Array.from({ length: isBundle ? 5 : 6 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`service-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell variant="action" />
                </TableRow>
              ))}
            {!isPending &&
              displayed.map((service) => (
                <TableRow key={service.id}>
                  <TableCell isTruncatable className="min-w-64">
                    <div className="flex items-center gap-2">
                      <ServiceIcon
                        hostPattern={hostPatternOf(service)}
                        serviceType={service.type}
                      />
                      <span className="truncate" title={service.name}>
                        {service.name}
                      </span>
                      {service.credential.type === AgentVaultCredentialType.OAuth &&
                        service.credential.status &&
                        service.credential.status !== AgentVaultOauthStatus.Connected && (
                          <OAuthStatusBadge status={service.credential.status} />
                        )}
                      {service.hook && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="neutral">
                              <WebhookIcon />
                              Hook
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm break-all">
                            {service.hook.url}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {service.description && (
                        <span
                          className="min-w-0 flex-1 truncate text-sm text-muted"
                          title={service.description}
                        >
                          {service.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{SERVICE_TYPE_LABELS[service.type]}</span>
                  </TableCell>
                  <TableCell>
                    <TargetCell service={service} />
                  </TableCell>
                  {!isBundle && (
                    <TableCell>
                      {service.accessBundles?.length ? (
                        <OverflowBadgeList
                          items={service.accessBundles}
                          getKey={(bundle) => bundle.id}
                          getLabel={(bundle) => bundle.name}
                          getLinkProps={(bundle) =>
                            linkOptions({
                              to: "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId",
                              params: { orgId: currentOrg.id, projectId, accessBundleId: bundle.id }
                            })
                          }
                        />
                      ) : (
                        <span className="text-sm text-muted">&mdash;</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm">
                          {format(new Date(service.createdAt), "MMM d, yyyy")}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {format(new Date(service.createdAt), "MMM d, yyyy h:mm a")}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      {service.personalValues && (
                        <PersonalSetupBadge
                          personalValues={service.personalValues}
                          onClick={() => onSetUp(service)}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell variant="action">
                    {(canManage || service.personalValues) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton variant="ghost" size="xs" aria-label="Open service actions">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={2} align="end">
                          {service.personalValues && (
                            <DropdownMenuItem onClick={() => onSetUp(service)}>
                              <KeyIcon />
                              {service.personalValues.isConfigured
                                ? "Update My Personal Values"
                                : "Set Up My Personal Values"}
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <>
                              <DropdownMenuItem onClick={() => onEdit(service)}>
                                <PencilIcon />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="danger"
                                onClick={() => setServiceToDelete(service)}
                              >
                                {isBundle ? <UnlinkIcon /> : <TrashIcon />}
                                {isBundle ? "Remove From Bundle" : "Delete"}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      {serverPaging && serverPaging.totalCount > 0 && (
        <CardContent className="-mt-5 pt-0">
          <Pagination
            count={serverPaging.totalCount}
            page={serverPaging.page}
            perPage={serverPaging.perPage}
            onChangePage={serverPaging.onChangePage}
            onChangePerPage={serverPaging.onChangePerPage}
          />
        </CardContent>
      )}

      <ConfirmationAlertDialog
        isOpen={Boolean(serviceToDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setServiceToDelete(null);
        }}
        title={
          isBundle
            ? `Remove "${serviceToDelete?.name}" from this bundle`
            : `Delete "${serviceToDelete?.name}"`
        }
        description={
          isBundle
            ? "Sessions on this bundle lose the service at the next proxy poll. It stays in the project, and members who can't reach it through another bundle lose their personal values for it."
            : "It leaves every access bundle it's in, agents lose the credential at the next proxy poll, and members' personal values for it are deleted. This cannot be undone."
        }
        confirmKey={serviceToDelete?.name ?? ""}
        confirmLabel={isBundle ? "Remove" : "Delete"}
        isPending={deleteService.isPending || removeService.isPending}
        onConfirm={handleDelete}
      />
    </Card>
  );
};
