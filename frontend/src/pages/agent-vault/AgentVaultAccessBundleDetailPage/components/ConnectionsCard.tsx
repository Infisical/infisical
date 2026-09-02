import { useState } from "react";
import { MoreHorizontalIcon, SearchIcon } from "lucide-react";

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
  TableRow
} from "@app/components/v3";
import { AgentVaultCredentialType, useDeleteAgentVaultConnection } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

const credentialSummary = (connection: TAgentVaultConnection) => {
  const { credential } = connection;
  if (credential.type === AgentVaultCredentialType.Bearer) return "Bearer";
  if (credential.type === AgentVaultCredentialType.Basic) return "Basic";
  return "Pass-through";
};

// 443 is the only port the grammar accepts without saying so, and every row would carry it.
const displayHost = (host: string) => host.trim().replace(/:443$/, "");

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

  const term = search.trim().toLowerCase();
  const displayed = connections.filter(
    (connection) =>
      connection.name.toLowerCase().includes(term) ||
      connection.hostPattern.toLowerCase().includes(term)
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
              <TableHead>Name</TableHead>
              <TableHead>Credential</TableHead>
              <TableHead>Hosts</TableHead>
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
                <TableCell>{credentialSummary(connection)}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs">
                    {connection.hostPattern.split(",").map(displayHost).join(", ")}
                  </span>
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
