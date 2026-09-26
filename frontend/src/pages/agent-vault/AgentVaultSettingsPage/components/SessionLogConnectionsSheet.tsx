import { subject } from "@casl/ability";
import {
  AsteriskIcon,
  CopyIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
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
  ProviderIcon,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { usePopUp } from "@app/hooks";
import { useGetAgentVaultSessionLogSettings } from "@app/hooks/api/agentVault";
import { useListAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";
import { DeleteAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/DeleteAppConnectionModal";
import { EditAppConnectionCredentialsModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/EditAppConnectionCredentialsModal";
import { EditAppConnectionDetailsModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/EditAppConnectionDetailsModal";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

const AWS_CONNECTION = APP_CONNECTION_MAP[AppConnection.AWS];

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const SessionLogConnectionsSheet = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { data: settings } = useGetAgentVaultSessionLogSettings();
  const { data: connections = [], isPending } = useListAppConnections(currentProject.id);
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addConnection",
    "editDetails",
    "editCredentials",
    "deleteConnection"
  ] as const);

  const canCreate = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const copyConnectionId = (connectionId: string) => {
    navigator.clipboard.writeText(connectionId);
    createNotification({ text: "Connection ID copied to clipboard", type: "info" });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Manage Connections
            <DocumentationLinkBadge href={`${AgentVaultDocsUrls.sessionLogs}#connections`} />
          </SheetTitle>
          <SheetDescription>
            AWS connections only Agent Vault can use. Organization connections are edited under
            Integrations.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="av"
              isDisabled={!canCreate}
              onClick={() => handlePopUpOpen("addConnection")}
            >
              <PlusIcon />
              Add Connection
            </Button>
          </div>

          {isPending && <Skeleton className="h-16 w-full" />}

          {!isPending && connections.length === 0 && (
            <Empty className="flex-none border">
              <EmptyHeader>
                <EmptyTitle>No connections yet</EmptyTitle>
                <EmptyDescription>
                  Add an AWS connection, then choose it when you set up session logs.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isPending && connections.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full">Name</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((connection) => {
                  const method = getAppConnectionMethodDetails(connection.method);
                  const MethodIcon = method.icon;
                  const isInUse = connection.id === settings?.appConnectionId;
                  const connectionSubject = subject(ProjectPermissionSub.AppConnections, {
                    connectionId: connection.id
                  });
                  const canEdit = permission.can(
                    ProjectPermissionAppConnectionActions.Edit,
                    connectionSubject
                  );
                  const canDelete = permission.can(
                    ProjectPermissionAppConnectionActions.Delete,
                    connectionSubject
                  );

                  return (
                    <TableRow key={connection.id}>
                      <TableCell className="max-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <ProviderIcon
                            alt={`${AWS_CONNECTION.name} connection`}
                            icon={AWS_CONNECTION.image}
                            className="w-4 shrink-0"
                          />
                          <span className="min-w-0 truncate">{connection.name}</span>
                          {connection.description && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon className="size-3.5 shrink-0 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent>{connection.description}</TooltipContent>
                            </Tooltip>
                          )}
                          {isInUse && <Badge variant="info">In Use</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <MethodIcon className="size-3.5 text-label/75" />
                          {method.name}
                        </span>
                      </TableCell>
                      <TableCell variant="action">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="ghost"
                              size="xs"
                              aria-label={`Actions for ${connection.name}`}
                            >
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <DropdownMenuItem onClick={() => copyConnectionId(connection.id)}>
                              <CopyIcon />
                              Copy Connection ID
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              isDisabled={!canEdit}
                              onClick={() => handlePopUpOpen("editDetails", connection)}
                            >
                              <PencilIcon />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              isDisabled={!canEdit}
                              onClick={() => handlePopUpOpen("editCredentials", connection)}
                            >
                              <AsteriskIcon />
                              Edit Credentials
                            </DropdownMenuItem>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <DropdownMenuItem
                                    variant="danger"
                                    isDisabled={!canDelete || isInUse}
                                    onClick={() => handlePopUpOpen("deleteConnection", connection)}
                                  >
                                    <Trash2Icon />
                                    Delete Connection
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              {isInUse && (
                                <TooltipContent side="left">
                                  Session logs use this connection. Choose another one in Configure
                                  before deleting it.
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <AddAppConnectionModal
          isOpen={popUp.addConnection.isOpen}
          onOpenChange={(isAddOpen) => handlePopUpToggle("addConnection", isAddOpen)}
          projectId={currentProject.id}
          projectType={currentProject.type}
          app={AppConnection.AWS}
        />
        <EditAppConnectionDetailsModal
          isOpen={popUp.editDetails.isOpen}
          onOpenChange={(isEditOpen) => handlePopUpToggle("editDetails", isEditOpen)}
          appConnection={popUp.editDetails.data}
        />
        <EditAppConnectionCredentialsModal
          isOpen={popUp.editCredentials.isOpen}
          onOpenChange={(isEditOpen) => handlePopUpToggle("editCredentials", isEditOpen)}
          appConnection={popUp.editCredentials.data}
        />
        <DeleteAppConnectionModal
          isOpen={popUp.deleteConnection.isOpen}
          onOpenChange={(isDeleteOpen) => handlePopUpToggle("deleteConnection", isDeleteOpen)}
          appConnection={popUp.deleteConnection.data}
        />
      </SheetContent>
    </Sheet>
  );
};
