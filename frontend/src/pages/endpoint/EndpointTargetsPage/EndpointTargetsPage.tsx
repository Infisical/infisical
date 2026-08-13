import { Helmet } from "react-helmet";
import { format } from "date-fns";
import { MoreHorizontal, NetworkIcon, Plus } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Skeleton,
  Switch,
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
import { usePopUp } from "@app/hooks";
import {
  EndpointTargetKind,
  TEndpointTarget,
  useListEndpointTargets,
  useUpdateEndpointTarget
} from "@app/hooks/api/endpoint";
import { ProjectType } from "@app/hooks/api/projects/types";

import { DeleteTargetModal } from "./components/DeleteTargetModal";
import { TargetModal } from "./components/TargetModal";

const KIND_LABEL: Record<EndpointTargetKind, string> = {
  [EndpointTargetKind.Domain]: "Domain",
  [EndpointTargetKind.Ip]: "IP Address"
};

// What the person on the device types, and what the device does about it. A domain is answered on a
// loopback address the agent claims; an IP target is answered on the address itself.
const AddressCell = ({ target }: { target: TEndpointTarget }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="cursor-default font-mono text-xs">
        {target.destination}:{target.port}
      </span>
    </TooltipTrigger>
    <TooltipContent>
      {target.kind === EndpointTargetKind.Domain
        ? `Assigned devices resolve ${target.destination} to ${target.loopbackIp ?? "a loopback address"} and tunnel it to the gateway.`
        : `Assigned devices claim ${target.destination} locally and tunnel it to the gateway.`}
      {target.ip ? ` The gateway dials ${target.ip}:${target.port}.` : ""}
    </TooltipContent>
  </Tooltip>
);


export const EndpointTargetsPage = () => {
  const { data: targets, isPending } = useListEndpointTargets();
  const updateTarget = useUpdateEndpointTarget();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "targetModal",
    "deleteTarget"
  ] as const);

  const onToggleEnabled = (target: TEndpointTarget, isEnabled: boolean) => {
    updateTarget.mutate(
      { targetId: target.id, isEnabled },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: `Target "${target.name}" ${isEnabled ? "enabled" : "disabled"}`
          });
        }
      }
    );
  };

  return (
    <>
      <Helmet>
        <title>Endpoint Private Access</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.Endpoint}
          title="Private Access"
          description="Private network resources devices can reach through Endpoint."
        />

        <Card>
          <CardHeader>
            <CardTitle>Private Resources</CardTitle>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.Endpoint}
              >
                {(isAllowed) => (
                  <Button
                    variant="endpoint"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("targetModal")}
                  >
                    <Plus />
                    Add Resource
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
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </CardContent>
          )}

          {!isPending && (targets ?? []).length === 0 && (
            <CardContent>
              <Empty className="border">
                <EmptyMedia variant="icon">
                  <NetworkIcon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No private resources yet</EmptyTitle>
                  <EmptyDescription>
                    Add a resource to publish an internal host or service. Devices reach it without
                    a VPN once you grant them access from the device.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}

          {!isPending && (targets ?? []).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(targets ?? []).map((target) => (
                  <TableRow key={target.id}>
                    <TableCell className="font-medium text-foreground">{target.name}</TableCell>
                    <TableCell className="text-muted">{KIND_LABEL[target.kind]}</TableCell>
                    <TableCell className="text-muted">
                      <AddressCell target={target} />
                    </TableCell>
                    <TableCell>
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Edit}
                        a={ProjectPermissionSub.Endpoint}
                      >
                        {(isAllowed) => (
                          <Switch
                            variant="endpoint"
                            checked={target.isEnabled}
                            disabled={!isAllowed || updateTarget.isPending}
                            onCheckedChange={(checked) => onToggleEnabled(target, checked)}
                            aria-label={`Toggle "${target.name}"`}
                          />
                        )}
                      </ProjectPermissionCan>
                    </TableCell>
                    <TableCell className="text-muted">
                      {format(new Date(target.createdAt), "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label={`Actions for ${target.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.Endpoint}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("targetModal", target)}
                              >
                                Edit
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.Endpoint}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("deleteTarget", target)}
                              >
                                Delete
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <TargetModal
        target={popUp.targetModal.data as TEndpointTarget | undefined}
        isOpen={popUp.targetModal.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("targetModal");
        }}
      />

      <DeleteTargetModal
        target={popUp.deleteTarget.data as TEndpointTarget | undefined}
        isOpen={popUp.deleteTarget.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteTarget");
        }}
      />
    </>
  );
};
