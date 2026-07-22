import { useState } from "react";
import {
  DoorClosedIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
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
      {!isPoolsLoading && !filteredPools?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {pools?.length ? <SearchIcon /> : <DoorClosedIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {pools?.length ? "No gateway pools match your search" : "No gateway pools configured"}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Name</TableHead>
              <TableHead>Connected</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPoolsLoading &&
              Array.from({ length: 3 }).map((_, row) => (
                <TableRow key={`pool-skeleton-${row}`}>
                  {Array.from({ length: 4 }).map((__, cell) => (
                    <TableCell key={`pool-skeleton-${row}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {filteredPools?.map((pool) => (
              <TableRow key={pool.id} onClick={() => setSelectedPoolId(pool.id)}>
                <TableCell className="font-medium">{pool.name}</TableCell>
                <TableCell>
                  {pool.connectedResourcesCount > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setResourcesPool({ id: pool.id, name: pool.name });
                      }}
                      className="cursor-pointer text-foreground underline decoration-muted underline-offset-2 hover:decoration-foreground"
                    >
                      {pool.connectedResourcesCount} resource
                      {pool.connectedResourcesCount !== 1 ? "s" : ""}
                    </button>
                  ) : (
                    <span className="text-muted">&mdash;</span>
                  )}
                </TableCell>
                <TableCell>
                  <PoolHealthBadge pool={pool} />
                </TableCell>
                <TableCell className="w-12">
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton aria-label="Gateway pool options" variant="ghost" size="sm">
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handlePopUpOpen("editPool", pool)}>
                          <PencilIcon />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handlePopUpOpen("deletePool", pool)}
                          variant="danger"
                        >
                          <TrashIcon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
      <AlertDialog
        open={popUp.deletePool.isOpen}
        onOpenChange={(open) => handlePopUpToggle("deletePool", open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {(popUp.deletePool.data as TGatewayPool)?.name || "gateway pool"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the gateway pool from your organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={deletePool.isPending}
              onClick={handleDeletePool}
            >
              Delete Pool
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
