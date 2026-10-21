import { useMemo, useState } from "react";
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
  TriangleAlertIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { displayHostPattern } from "@app/components/agent-vault/service-sheet/serviceSchema";
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
import { useDeleteAgentVaultService } from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

enum SortColumn {
  Name = "name",
  Hosts = "hosts",
  Created = "created"
}

const SORT_COMPARATORS: Record<
  SortColumn,
  (a: TAgentVaultService, b: TAgentVaultService) => number
> = {
  [SortColumn.Name]: (a, b) => a.name.localeCompare(b.name),
  [SortColumn.Hosts]: (a, b) => a.hostPattern.localeCompare(b.hostPattern),
  [SortColumn.Created]: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
};

type Props = {
  accessBundleId: string;
  services: TAgentVaultService[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (service: TAgentVaultService) => void;
  onSetUp: (service: TAgentVaultService) => void;
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

export const ServicesCard = ({
  accessBundleId,
  services,
  canManage,
  onAdd,
  onEdit,
  onSetUp
}: Props) => {
  const [search, setSearch] = useState("");
  const [serviceToDelete, setServiceToDelete] = useState<TAgentVaultService | null>(null);
  const deleteService = useDeleteAgentVaultService();

  const [sortColumn, setSortColumn] = useState(SortColumn.Created);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = services.filter(
      (service) =>
        service.name.toLowerCase().includes(term) ||
        service.hostPattern.toLowerCase().includes(term)
    );

    const ordered = [...filtered].sort(SORT_COMPARATORS[sortColumn]);
    return sortDirection === "ascending" ? ordered : ordered.reverse();
  }, [services, search, sortColumn, sortDirection]);

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
          A service defines one API the agent can reach, the hosts the API answers on, and the
          credential the proxy attaches to matching requests.
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

      {services.length > 0 && (
        <CardContent>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services..."
            />
          </InputGroup>
        </CardContent>
      )}

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
                  : "Try a different search term."}
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
                sortDirection={sortColumn === SortColumn.Hosts ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Hosts, direction)}
              >
                Hosts
                <ChevronDownIcon className={sortIconClassName(SortColumn.Hosts)} />
              </TableHead>
              <TableHead
                sortDirection={sortColumn === SortColumn.Created ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Created, direction)}
              >
                Created
                <ChevronDownIcon className={sortIconClassName(SortColumn.Created)} />
              </TableHead>
              <TableHead className="w-0" />
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
                  </div>
                </TableCell>
                <TableCell>
                  <HostsCell hostPattern={service.hostPattern} />
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
                <TableCell>
                  <div className="flex justify-center">
                    {service.personalValues &&
                      (service.personalValues.isConfigured ? (
                        <Badge variant="neutral" asChild>
                          <button type="button" onClick={() => onSetUp(service)}>
                            <CircleCheckIcon />
                            Configured
                          </button>
                        </Badge>
                      ) : (
                        <Badge variant="warning" asChild>
                          <button type="button" onClick={() => onSetUp(service)}>
                            <TriangleAlertIcon />
                            Requires Setup
                          </button>
                        </Badge>
                      ))}
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
                              <TrashIcon />
                              Delete
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

      <ConfirmationAlertDialog
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
