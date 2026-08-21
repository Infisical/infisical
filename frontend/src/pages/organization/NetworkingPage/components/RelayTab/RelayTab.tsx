import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { formatRelative } from "date-fns";
import {
  CopyIcon,
  DoorClosedIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadLabel,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteRelayById, useGetRelays } from "@app/hooks/api/relays";

import { RelayDeployModal } from "./components/RelayDeployModal";

const RelayHealthStatus = ({ heartbeat }: { heartbeat?: string }) => {
  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;

  if (!heartbeatDate) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="warning">Unregistered</Badge>
        </TooltipTrigger>
        <TooltipContent>No heartbeat data available</TooltipContent>
      </Tooltip>
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const isHealthy = heartbeatDate >= oneHourAgo;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={isHealthy ? "success" : "danger"}>
          {isHealthy ? "Healthy" : "Unreachable"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Last heartbeat: {heartbeatDate.toLocaleString()}</TooltipContent>
    </Tooltip>
  );
};

export const RelayTab = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const { data: relays, isPending: isRelaysLoading } = useGetRelays();
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deleteRelay",
      "deployRelay"
    ] as const);

    const action = useSearch({
      from: ROUTE_PATHS.Organization.NetworkingPage.id,
      select: (s) => s.action
    });

    const navigate = useNavigate({
      from: ROUTE_PATHS.Organization.NetworkingPage.fullPath
    });

    useEffect(() => {
      if (action === "deploy-relay") {
        handlePopUpOpen("deployRelay");
        navigate({
          search: (prev) => ({ ...prev, action: undefined }),
          replace: true
        });
      }
    }, [action, handlePopUpOpen, navigate]);

    const deleteRelayById = useDeleteRelayById();

    const handleDeleteRelay = async () => {
      const data = popUp.deleteRelay.data as { id: string };
      try {
        await deleteRelayById.mutateAsync(data.id);
        handlePopUpToggle("deleteRelay", false);
        createNotification({
          type: "success",
          text: "Successfully deleted relay"
        });
      } catch {
        createNotification({ type: "error", text: "Failed to delete relay" });
      }
    };

    const filteredRelays = relays?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            Relays
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/gateways/relay-deployment" />
          </CardTitle>
          <CardDescription>Create and manage network relays from Infisical</CardDescription>
          <CardAction>
            <Button variant="org" onClick={() => handlePopUpOpen("deployRelay")}>
              <PlusIcon />
              Create Relay
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <InputGroup className="mb-4">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search relay..."
            />
          </InputGroup>
          {!isRelaysLoading && !filteredRelays?.length ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {relays?.length ? <SearchIcon /> : <DoorClosedIcon />}
                </EmptyMedia>
                <EmptyTitle>
                  {relays?.length ? "No relays match your search" : "No relays configured"}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <TableHeadLabel>Name</TableHeadLabel>
                  </TableHead>
                  <TableHead>
                    <TableHeadLabel>Host</TableHeadLabel>
                  </TableHead>
                  <TableHead>
                    <TableHeadLabel>Created</TableHeadLabel>
                  </TableHead>
                  <TableHead>
                    <TableHeadLabel
                      trailing={
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon className="size-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            The last known health check. Triggers every hour.
                          </TooltipContent>
                        </Tooltip>
                      }
                    >
                      Health Check
                    </TableHeadLabel>
                  </TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isRelaysLoading &&
                  ["first", "second", "third"].map((row) => (
                    <TableRow key={`relay-skeleton-${row}`}>
                      {["name", "address", "connected", "health", "actions"].map((cell) => (
                        <TableCell key={`relay-skeleton-${row}-${cell}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {filteredRelays?.map((el) => (
                  <TableRow
                    key={el.id}
                    onClick={
                      el.orgId
                        ? () =>
                            navigate({
                              to: "/organizations/$orgId/networking/relays/$relayId",
                              params: { orgId, relayId: el.id }
                            })
                        : undefined
                    }
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{el.name}</span>
                        {!el.orgId && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="neutral" className="shrink-0">
                                Managed
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>This relay is managed by Infisical.</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{el.host}</TableCell>
                    <TableCell>{formatRelative(new Date(el.createdAt), new Date())}</TableCell>
                    <TableCell>
                      <RelayHealthStatus heartbeat={el.heartbeat} />
                    </TableCell>
                    <TableCell variant="action" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton aria-label="Relay options" variant="ghost" size="sm">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(el.id)}>
                            <CopyIcon />
                            Copy ID
                          </DropdownMenuItem>
                          <OrgPermissionCan
                            I={OrgRelayPermissionActions.DeleteRelays}
                            a={OrgPermissionSubjects.Relay}
                          >
                            {(isAllowed: boolean) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed || !el.orgId}
                                variant="danger"
                                onClick={() => handlePopUpOpen("deleteRelay", el)}
                              >
                                <TrashIcon />
                                Delete Relay
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <AlertDialog
            open={popUp.deleteRelay.isOpen}
            confirmationValue={(popUp.deleteRelay.data as { name?: string })?.name || "relay"}
            onOpenChange={(open) => handlePopUpToggle("deleteRelay", open)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Relay?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the relay from your organization.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogConfirmationField
                inputProps={{
                  placeholder: (popUp.deleteRelay.data as { name?: string })?.name || "relay"
                }}
              />
              <Alert variant="danger" appearance="borderless">
                <AlertDescription>Deleting this relay cannot be undone.</AlertDescription>
              </Alert>
              <AlertDialogFooter>
                <AlertDialogCancel isDisabled={deleteRelayById.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="danger"
                  isPending={deleteRelayById.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    handleDeleteRelay();
                  }}
                >
                  Delete Relay
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <RelayDeployModal
            isOpen={popUp.deployRelay.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("deployRelay", isOpen)}
          />
        </CardContent>
      </Card>
    );
  },
  {
    action: OrgRelayPermissionActions.ListRelays,
    subject: OrgPermissionSubjects.Relay,
    accessRestrictedMode: "dialog"
  }
);
