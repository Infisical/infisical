import { useState } from "react";
import { faEllipsisV, faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useSubscription } from "@app/context/SubscriptionContext";
import { usePopUp } from "@app/hooks";
import { useDeleteGatewayPool, useListGatewayPools } from "@app/hooks/api/gateway-pools";
import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";

import { EditGatewayPoolModal } from "./EditGatewayPoolModal";
import { PoolConnectedResourcesDrawer } from "./PoolConnectedResourcesDrawer";
import { PoolDetailSheet } from "./PoolDetailSheet";
import { PoolHealthBadge } from "./PoolHealthBadge";

type Props = {
  search: string;
};

export const GatewayPoolsContent = ({ search }: Props) => {
  const { subscription } = useSubscription();
  const isEnterprise = subscription?.gatewayPool;
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [resourcesPool, setResourcesPool] = useState<{ id: string; name: string } | null>(null);
  const { data: pools, isLoading: isPoolsLoading } = useListGatewayPools({
    refetchInterval: 15_000,
    enabled: Boolean(isEnterprise)
  });
  const deletePool = useDeleteGatewayPool();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "editPool",
    "deletePool"
  ] as const);

  const filteredPools = pools?.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const selectedPool = pools?.find((p) => p.id === selectedPoolId) ?? null;

  const handleDeletePool = async () => {
    const pool = popUp.deletePool.data as TGatewayPool;
    if (!pool) return;

    try {
      await deletePool.mutateAsync(pool.id);
      createNotification({ type: "success", text: `Pool "${pool.name}" deleted` });
      handlePopUpToggle("deletePool", false);
      if (selectedPoolId === pool.id) setSelectedPoolId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete pool";
      createNotification({ type: "error", text: message });
    }
  };

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">Name</Th>
              <Th>Connected</Th>
              <Th>Health</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPoolsLoading && <TableSkeleton innerKey="pool-table" columns={4} key="pool-table" />}
            {filteredPools?.map((pool) => (
              <Tr
                key={pool.id}
                className="cursor-pointer hover:bg-mineshaft-700/50"
                onClick={() => setSelectedPoolId(pool.id)}
              >
                <Td>{pool.name}</Td>
                <Td>
                  {pool.connectedResourcesCount > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setResourcesPool({ id: pool.id, name: pool.name });
                      }}
                      className="cursor-pointer text-mineshaft-200 underline decoration-mineshaft-400 underline-offset-2 hover:text-mineshaft-100 hover:decoration-mineshaft-300"
                    >
                      {pool.connectedResourcesCount} resource
                      {pool.connectedResourcesCount !== 1 ? "s" : ""}
                    </button>
                  ) : (
                    <span className="text-mineshaft-400">&mdash;</span>
                  )}
                </Td>
                <Td>
                  <PoolHealthBadge pool={pool} />
                </Td>
                <Td>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton ariaLabel="Options" variant="plain" size="sm" className="p-1.5">
                          <FontAwesomeIcon icon={faEllipsisV} />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          icon={<FontAwesomeIcon icon={faPen} />}
                          onClick={() => handlePopUpOpen("editPool", pool)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          icon={<FontAwesomeIcon icon={faTrash} />}
                          onClick={() => handlePopUpOpen("deletePool", pool)}
                          className="text-red-500"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Td>
              </Tr>
            ))}
            {!isPoolsLoading && !filteredPools?.length && (
              <Tr>
                <Td colSpan={4}>
                  <EmptyState title="No gateway pools found" />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>

      <PoolDetailSheet
        isOpen={Boolean(selectedPoolId)}
        onOpenChange={(open) => {
          if (!open) setSelectedPoolId(null);
        }}
        pool={selectedPool}
      />
      {resourcesPool && (
        <PoolConnectedResourcesDrawer
          isOpen={Boolean(resourcesPool)}
          onOpenChange={(open) => {
            if (!open) setResourcesPool(null);
          }}
          poolId={resourcesPool.id}
          poolName={resourcesPool.name}
        />
      )}
      <EditGatewayPoolModal
        isOpen={popUp.editPool.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("editPool", isOpen)}
        pool={popUp.editPool.data as TGatewayPool}
      />
      <DeleteActionModal
        isOpen={popUp.deletePool.isOpen}
        title={`Delete pool "${(popUp.deletePool.data as TGatewayPool)?.name ?? ""}"?`}
        onChange={(isOpen) => handlePopUpToggle("deletePool", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeletePool}
      />
    </div>
  );
};
