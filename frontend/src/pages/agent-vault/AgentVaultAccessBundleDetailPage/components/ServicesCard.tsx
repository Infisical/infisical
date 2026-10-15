import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ChevronDownIcon,
  GlobeIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { OAuthStatusBadge } from "@app/components/agent-vault/service-sheet/OAuthAuthorizeCard";
import {
  displayHostPattern,
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
  DeleteConfirmDialog,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import {
  AgentVaultCredentialType,
  AgentVaultOAuthStatus,
  AgentVaultServiceType,
  useDeleteAgentVaultService
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

enum SortColumn {
  Name = "name",
  Type = "type",
  Target = "target",
  Created = "created"
}

const ALL_TYPES = "all";

const serviceTypeOf = (service: TAgentVaultService) => service.type ?? AgentVaultServiceType.Http;

const targetOf = (service: TAgentVaultService) =>
  service.type === AgentVaultServiceType.Mcp ? service.config.serverUrl : service.hostPattern;

const SORT_COMPARATORS: Record<
  SortColumn,
  (a: TAgentVaultService, b: TAgentVaultService) => number
> = {
  [SortColumn.Name]: (a, b) => a.name.localeCompare(b.name),
  [SortColumn.Type]: (a, b) => serviceTypeOf(a).localeCompare(serviceTypeOf(b)),
  [SortColumn.Target]: (a, b) => targetOf(a).localeCompare(targetOf(b)),
  [SortColumn.Created]: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
};

type Props = {
  accessBundleId: string;
  services: TAgentVaultService[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (service: TAgentVaultService) => void;
  onReauthorize: (service: TAgentVaultService) => void;
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

const TypeBadge = ({ type }: { type: AgentVaultServiceType }) => (
  <Badge variant="outline">
    {type === AgentVaultServiceType.Mcp ? <ServerIcon /> : <GlobeIcon />}
    {SERVICE_TYPE_LABELS[type]}
  </Badge>
);

const TargetCell = ({ service }: { service: TAgentVaultService }) =>
  service.type === AgentVaultServiceType.Mcp ? (
    <span className="block max-w-72 truncate font-mono text-sm" title={service.config.serverUrl}>
      {service.config.serverUrl}
    </span>
  ) : (
    <HostsCell hostPattern={service.hostPattern} />
  );

export const ServicesCard = ({
  accessBundleId,
  services,
  canManage,
  onAdd,
  onEdit,
  onReauthorize
}: Props) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AgentVaultServiceType | typeof ALL_TYPES>(ALL_TYPES);
  const [serviceToDelete, setServiceToDelete] = useState<TAgentVaultService | null>(null);
  const deleteService = useDeleteAgentVaultService();

  const [sortColumn, setSortColumn] = useState(SortColumn.Created);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = services.filter(
      (service) =>
        (typeFilter === ALL_TYPES || serviceTypeOf(service) === typeFilter) &&
        (service.name.toLowerCase().includes(term) ||
          service.hostPattern.toLowerCase().includes(term) ||
          targetOf(service).toLowerCase().includes(term))
    );

    const ordered = [...filtered].sort(SORT_COMPARATORS[sortColumn]);
    return sortDirection === "ascending" ? ordered : ordered.reverse();
  }, [services, search, typeFilter, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn, direction: "ascending" | "descending" | "none") => {
    if (direction === "none") {
      setSortColumn(SortColumn.Created);
      setSortDirection("descending");
      return;
    }
    setSortColumn(column);
    setSortDirection(direction);
  };

  const sortIconClassName = (column: SortColumn) =>
    twMerge(
      "size-3.5 transition-transform",
      sortColumn === column && sortDirection === "descending" && "rotate-180",
      sortColumn !== column && "opacity-30"
    );

  const handleDelete = async () => {
    try {
      if (!serviceToDelete) return;

      await deleteService.mutateAsync({
        accessBundleId,
        serviceId: serviceToDelete.id
      });
      createNotification({
        text: `Service "${serviceToDelete.name}" deleted`,
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
          A service defines one HTTP API or MCP server the agent can reach, and the credential the
          proxy attaches to its requests.
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="av" onClick={onAdd}>
              <PlusIcon />
              Add Service
            </Button>
          </CardAction>
        )}
        {services.length > 0 && (
          <div className="flex items-center gap-3 @xs:col-span-2">
            <InputGroup className="flex-1">
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
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
            >
              <SelectTrigger className="w-44" aria-label="Filter by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value={ALL_TYPES}>All Types</SelectItem>
                <SelectItem value={AgentVaultServiceType.Http}>HTTP APIs</SelectItem>
                <SelectItem value={AgentVaultServiceType.Mcp}>MCP Servers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>

      {displayed.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {services.length === 0 ? "No services yet" : "No services match your search"}
              </EmptyTitle>
              <EmptyDescription>
                {services.length === 0
                  ? "Add services to give this bundle access to external hosts."
                  : "Try a different search term or type."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                sortDirection={sortColumn === SortColumn.Name ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Name, direction)}
              >
                Name
                <ChevronDownIcon className={sortIconClassName(SortColumn.Name)} />
              </TableHead>
              <TableHead
                sortDirection={sortColumn === SortColumn.Type ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Type, direction)}
              >
                Type
                <ChevronDownIcon className={sortIconClassName(SortColumn.Type)} />
              </TableHead>
              <TableHead
                sortDirection={sortColumn === SortColumn.Target ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Target, direction)}
              >
                Target
                <ChevronDownIcon className={sortIconClassName(SortColumn.Target)} />
              </TableHead>
              <TableHead
                sortDirection={sortColumn === SortColumn.Created ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Created, direction)}
              >
                Created
                <ChevronDownIcon className={sortIconClassName(SortColumn.Created)} />
              </TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.map((service) => (
              <TableRow key={service.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ServiceIcon hostPattern={service.hostPattern} />
                    {service.name}
                    {service.credential.type === AgentVaultCredentialType.OAuth &&
                      service.credential.status !== AgentVaultOAuthStatus.Connected && (
                        <OAuthStatusBadge status={service.credential.status} />
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  <TypeBadge type={serviceTypeOf(service)} />
                </TableCell>
                <TableCell>
                  <TargetCell service={service} />
                </TableCell>
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
                <TableCell variant="action">
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs" aria-label="Open service actions">
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent sideOffset={2} align="end">
                        <DropdownMenuItem onClick={() => onEdit(service)}>
                          <PencilIcon />
                          Edit
                        </DropdownMenuItem>
                        {service.credential.type === AgentVaultCredentialType.OAuth && (
                          <DropdownMenuItem onClick={() => onReauthorize(service)}>
                            <KeyRoundIcon />
                            Reauthorize
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="danger"
                          onClick={() => setServiceToDelete(service)}
                        >
                          <TrashIcon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DeleteConfirmDialog
        isOpen={Boolean(serviceToDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setServiceToDelete(null);
        }}
        title={`Delete "${serviceToDelete?.name}"`}
        description="Agents lose this credential at the next proxy poll. This cannot be undone."
        confirmKey={serviceToDelete?.name ?? ""}
        isPending={deleteService.isPending}
        onConfirm={handleDelete}
      />
    </Card>
  );
};
