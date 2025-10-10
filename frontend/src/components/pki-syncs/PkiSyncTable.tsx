import { faPlug, faRefresh, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Badge,
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSyncs: TPkiSync[];
  onEdit: (pkiSync: TPkiSync) => void;
  onDelete: (pkiSync: TPkiSync) => void;
  onTrigger: (pkiSync: TPkiSync) => void;
};

const getSyncStatusBadge = (status?: string) => {
  switch (status) {
    case "SUCCESS":
      return <Badge variant="success">Success</Badge>;
    case "FAILED":
      return <Badge variant="danger">Failed</Badge>;
    case "RUNNING":
      return <Badge variant="primary">Running</Badge>;
    case "PENDING":
    default:
      return <Badge variant="primary">Pending</Badge>;
  }
};

export const PkiSyncTable = ({ pkiSyncs, onEdit, onDelete, onTrigger }: Props) => {
  if (!pkiSyncs.length) {
    return (
      <div className="flex h-96 items-center justify-center">
        <EmptyState title="No PKI syncs created" icon={faPlug}>
          Start by creating a PKI sync to synchronize certificates with external services
        </EmptyState>
      </div>
    );
  }

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Destination</Th>
            <Th>Connection</Th>
            <Th>Auto Sync</Th>
            <Th>Status</Th>
            <Th>Last Sync</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {pkiSyncs.map((pkiSync) => (
            <Tr
              key={pkiSync.id}
              className="hover:bg-mineshaft-700 cursor-pointer"
              onClick={() => onEdit(pkiSync)}
            >
              <Td>{pkiSync.name}</Td>
              <Td>
                <div className="flex items-center space-x-2">
                  <Badge variant="primary">{pkiSync.destination}</Badge>
                </div>
              </Td>
              <Td>{pkiSync.appConnectionName || "Unknown"}</Td>
              <Td>
                <Badge variant={pkiSync.isAutoSyncEnabled ? "success" : "danger"}>
                  {pkiSync.isAutoSyncEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </Td>
              <Td>{getSyncStatusBadge(pkiSync.syncStatus ?? undefined)}</Td>
              <Td>
                {pkiSync.lastSyncedAt
                  ? new Date(pkiSync.lastSyncedAt).toLocaleDateString()
                  : "Never"}
              </Td>
              <Td>
                <div className="flex items-center space-x-2">
                  <IconButton
                    size="sm"
                    variant="plain"
                    ariaLabel="Trigger sync"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTrigger(pkiSync);
                    }}
                  >
                    <FontAwesomeIcon icon={faRefresh} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="plain"
                    ariaLabel="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(pkiSync);
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};
