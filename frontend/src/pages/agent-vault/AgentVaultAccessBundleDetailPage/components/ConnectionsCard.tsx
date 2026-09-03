import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDownIcon, MoreHorizontalIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  CREDENTIAL_LABELS,
  displayHostPattern
} from "@app/components/agent-vault/connection-sheet/connectionSchema";
import { ConnectionIcon } from "@app/components/agent-vault/ConnectionIconStack";
import { createNotification } from "@app/components/notifications";
import {
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
import { useDeleteAgentVaultConnection } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

enum SortColumn {
  Name = "name",
  Credential = "credential",
  Hosts = "hosts",
  Created = "created"
}

const SORT_COMPARATORS: Record<
  SortColumn,
  (a: TAgentVaultConnection, b: TAgentVaultConnection) => number
> = {
  [SortColumn.Name]: (a, b) => a.name.localeCompare(b.name),
  [SortColumn.Credential]: (a, b) =>
    CREDENTIAL_LABELS[a.credential.type].localeCompare(CREDENTIAL_LABELS[b.credential.type]),
  [SortColumn.Hosts]: (a, b) => a.hostPattern.localeCompare(b.hostPattern),
  [SortColumn.Created]: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
};

type Props = {
  accessBundleId: string;
  connections: TAgentVaultConnection[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (connection: TAgentVaultConnection) => void;
};

export const ConnectionsCard = ({
  accessBundleId,
  connections,
  canManage,
  onAdd,
  onEdit
}: Props) => {
  const [search, setSearch] = useState("");
  const [connectionToDelete, setConnectionToDelete] = useState<TAgentVaultConnection | null>(null);
  const deleteConnection = useDeleteAgentVaultConnection();

  // Newest first, so a connection someone just added is the one they are looking at.
  const [sortColumn, setSortColumn] = useState(SortColumn.Created);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = connections.filter(
      (connection) =>
        connection.name.toLowerCase().includes(term) ||
        connection.hostPattern.toLowerCase().includes(term)
    );

    const ordered = [...filtered].sort(SORT_COMPARATORS[sortColumn]);
    return sortDirection === "ascending" ? ordered : ordered.reverse();
  }, [connections, search, sortColumn, sortDirection]);

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
    if (!connectionToDelete) return;

    await deleteConnection.mutateAsync({
      accessBundleId,
      connectionId: connectionToDelete.id
    });
    createNotification({
      text: `Connection "${connectionToDelete.name}" deleted`,
      type: "success"
    });
    setConnectionToDelete(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Connections
          <DocumentationLinkBadge href={AgentVaultDocsUrls.accessBundles} />
        </CardTitle>
        <CardDescription>
          One HTTP target and its credential. The proxy attaches it only to these hosts.
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="av" onClick={onAdd}>
              Add Connection
            </Button>
          </CardAction>
        )}
      </CardHeader>

      {connections.length > 0 && (
        <CardContent>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connections..."
            />
          </InputGroup>
        </CardContent>
      )}

      {displayed.length === 0 ? (
        <CardContent>
          <Empty className="border" frame="dashed">
            <EmptyHeader>
              <EmptyTitle>
                {connections.length === 0
                  ? "No connections yet"
                  : "No connections match your search"}
              </EmptyTitle>
              <EmptyDescription>
                {connections.length === 0
                  ? "Add a connection to give this bundle a host and a credential."
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
                sortDirection={sortColumn === SortColumn.Credential ? sortDirection : "none"}
                onSortChange={(direction) => handleSort(SortColumn.Credential, direction)}
              >
                Credential
                <ChevronDownIcon className={sortIconClassName(SortColumn.Credential)} />
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
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.map((connection) => (
              <TableRow key={connection.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ConnectionIcon hostPattern={connection.hostPattern} />
                    {connection.name}
                  </div>
                </TableCell>
                <TableCell>{CREDENTIAL_LABELS[connection.credential.type]}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs">
                    {displayHostPattern(connection.hostPattern)}
                  </span>
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm">
                        {format(new Date(connection.createdAt), "MMM d, yyyy")}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {format(new Date(connection.createdAt), "MMM d, yyyy h:mm a")}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell variant="action">
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs" aria-label="Open connection actions">
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent sideOffset={2} align="end">
                        <DropdownMenuItem onClick={() => onEdit(connection)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConnectionToDelete(connection)}>
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
        isOpen={Boolean(connectionToDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConnectionToDelete(null);
        }}
        title={`Delete "${connectionToDelete?.name}"`}
        description="Agents lose this credential at the next proxy poll. This cannot be undone."
        confirmKey={connectionToDelete?.name ?? ""}
        isPending={deleteConnection.isPending}
        onConfirm={handleDelete}
      />
    </Card>
  );
};
