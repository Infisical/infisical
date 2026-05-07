import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageLoader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  useCertManagerLegacyInstances,
  useSetCertManagerActiveProject
} from "@app/hooks/api/certManagerInstance";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["activeInstance"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["activeInstance"]>, state?: boolean) => void;
};

export const ActiveInstanceModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { data, isPending } = useCertManagerLegacyInstances();
  const setActive = useSetCertManagerActiveProject();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onPick = async (projectId: string, name: string) => {
    setPendingId(projectId);
    try {
      await setActive.mutateAsync(projectId);
      createNotification({
        type: "success",
        text: `${name} is now the active Cert Manager instance`
      });
      handlePopUpToggle("activeInstance", false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to switch active instance.";
      createNotification({ type: "error", text: detail });
    } finally {
      setPendingId(null);
    }
  };

  const renderInstances = () => {
    if (isPending || !data) {
      return (
        <div className="h-48">
          <PageLoader lottieClassName="w-16" />
        </div>
      );
    }
    if (data.instances.length === 0) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No Cert Manager instances</EmptyTitle>
            <EmptyDescription>
              Create a Cert Manager project from the organization to get started.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">Name</TableHead>
            <TableHead className="text-right whitespace-nowrap">Certificates</TableHead>
            <TableHead className="text-right whitespace-nowrap">Syncs</TableHead>
            <TableHead className="text-right whitespace-nowrap">Alerts</TableHead>
            <TableHead className="text-right whitespace-nowrap">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.instances.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="w-full">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground">{i.name}</span>
                  <span className="font-mono text-xs text-accent">{i.slug}</span>
                </div>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">{i.certificateCount}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{i.syncCount}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{i.alertCount}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {i.isActive ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    isPending={pendingId === i.id}
                    onClick={() => onPick(i.id, i.name)}
                  >
                    Set as active
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Dialog
      open={popUp?.activeInstance?.isOpen}
      onOpenChange={(o) => handlePopUpToggle("activeInstance", o)}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Cert Manager instances</DialogTitle>
          <DialogDescription>
            Switch the active Cert Manager instance for this organization. New API requests without
            a projectId resolve to the active instance.
          </DialogDescription>
        </DialogHeader>
        {renderInstances()}
      </DialogContent>
    </Dialog>
  );
};
