import { useState } from "react";
import { Plus, TargetIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  EndpointTargetKind,
  TEndpointTarget,
  useGrantDeviceTargetAccess,
  useListEndpointTargets,
  useRevokeDeviceTargetAccess
} from "@app/hooks/api/endpoint";

const KIND_LABEL: Record<EndpointTargetKind, string> = {
  [EndpointTargetKind.Domain]: "Domain",
  [EndpointTargetKind.Ip]: "IP Address"
};

// Assignment alone does not mean the device can reach it: a disabled target stays assigned, and the
// gateway FK is SET NULL so deleting a gateway leaves the target intact but unreachable. Answering
// "can this device reach it right now" is what this column is for.
const ReachabilityCell = ({ target }: { target: TEndpointTarget }) => {
  if (!target.gatewayId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="danger" className="cursor-default">
            No gateway
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          This resource&apos;s gateway was deleted, so nothing can reach it. Edit it under Private
          Access to choose another.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!target.isEnabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral" className="cursor-default">
            Disabled
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          This device still has access, but the resource is switched off, so the agent will not claim
          its address.
        </TooltipContent>
      </Tooltip>
    );
  }

  return <Badge variant="success">Reachable</Badge>;
};

// The device-specific half: what this machine actually does with the address. A domain is answered
// on a loopback address the agent claims for it; an IP resource is claimed as itself.
const LocalAddressCell = ({ target }: { target: TEndpointTarget }) => {
  const isDomain = target.kind === EndpointTargetKind.Domain;
  const shown = isDomain ? (target.loopbackIp ?? "Not allocated") : target.destination;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default font-mono text-xs">{shown}</span>
      </TooltipTrigger>
      <TooltipContent>
        {isDomain
          ? `This device resolves ${target.destination} to ${target.loopbackIp ?? "a loopback address"} and tunnels it to the gateway.`
          : `This device claims ${target.destination} on its own loopback and tunnels it to the gateway.`}
      </TooltipContent>
    </Tooltip>
  );
};

const GrantAccessDialog = ({
  deviceId,
  available,
  isOpen,
  onOpenChange
}: {
  deviceId: string;
  available: TEndpointTarget[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [targetId, setTargetId] = useState("");
  const grantAccess = useGrantDeviceTargetAccess();

  const onGrant = async () => {
    try {
      await grantAccess.mutateAsync({ deviceId, targetId });
      createNotification({ text: "This device can now reach that resource.", type: "success" });
      setTargetId("");
      onOpenChange(false);
    } catch {
      // Reported globally by the mutation cache.
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant Access</DialogTitle>
          <DialogDescription>
            Let this device reach a private resource. Resources themselves are defined under Private
            Access.
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <p className="text-sm text-muted">
            This device can already reach every private resource in the project.
          </p>
        ) : (
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a resource" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {available.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {target.name} — {target.destination}:{target.port}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button isDisabled={!targetId} isPending={grantAccess.isPending} onClick={onGrant} variant="endpoint">
            Grant Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AccessRow = ({ deviceId, target }: { deviceId: string; target: TEndpointTarget }) => {
  const revokeAccess = useRevokeDeviceTargetAccess();

  const onRevoke = async () => {
    try {
      await revokeAccess.mutateAsync({ deviceId, targetId: target.id });
      createNotification({ text: `Access to "${target.name}" revoked.`, type: "success" });
    } catch {
      // Reported globally by the mutation cache.
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{target.name}</TableCell>
      <TableCell className="text-muted">{KIND_LABEL[target.kind]}</TableCell>
      <TableCell className="text-muted">
        <span className="font-mono text-xs">
          {target.destination}:{target.port}
        </span>
      </TableCell>
      <TableCell className="text-muted">
        <LocalAddressCell target={target} />
      </TableCell>
      <TableCell>
        <ReachabilityCell target={target} />
      </TableCell>
      <TableCell className="text-right">
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Endpoint}>
          {(isAllowed) => (
            <Button
              size="xs"
              variant="outline"
              isDisabled={!isAllowed}
              isPending={revokeAccess.isPending}
              onClick={onRevoke}
            >
              Revoke
            </Button>
          )}
        </ProjectPermissionCan>
      </TableCell>
    </TableRow>
  );
};

type Props = {
  deviceId: string;
};

export const PrivateAccessCard = ({ deviceId }: Props) => {
  const [isGrantOpen, setIsGrantOpen] = useState(false);
  const { data: targets, isPending } = useListEndpointTargets();

  // Split here rather than server-side: the targets list already carries its assignments, and a
  // project has few enough of them that a second endpoint would buy nothing.
  const canReach = (target: TEndpointTarget) =>
    target.assignments.some((assignment) => assignment.deviceId === deviceId);

  const granted = (targets ?? []).filter(canReach);
  const available = (targets ?? []).filter((target) => !canReach(target));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Private Access</CardTitle>
        <CardDescription>
          Private resources this device can reach, and the address it reaches each one on.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={ProjectPermissionSub.Endpoint}
          >
            {(isAllowed) => (
              <Button
                variant="endpoint"
                isDisabled={!isAllowed}
                onClick={() => setIsGrantOpen(true)}
              >
                <Plus />
                Grant Access
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>

      {isPending && (
        <CardContent>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </CardContent>
      )}

      {!isPending && granted.length === 0 && (
        <CardContent>
          <Empty className="border">
            <EmptyMedia variant="icon">
              <TargetIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No private access</EmptyTitle>
              <EmptyDescription>
                This device cannot reach any private resources. Grant it access to one to get
                started.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}

      {!isPending && granted.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Reached On</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {granted.map((target) => (
                <AccessRow key={target.id} deviceId={deviceId} target={target} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}

      <GrantAccessDialog
        deviceId={deviceId}
        available={available}
        isOpen={isGrantOpen}
        onOpenChange={setIsGrantOpen}
      />
    </Card>
  );
};
