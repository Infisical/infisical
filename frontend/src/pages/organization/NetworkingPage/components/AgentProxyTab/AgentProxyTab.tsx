import { useState } from "react";
import { formatRelative } from "date-fns";
import {
  ActivityIcon,
  CircleDashedIcon,
  CircleXIcon,
  CopyIcon,
  GlobeIcon,
  KeyIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  WaypointsIcon
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
  CodeBlock,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldLabel,
  IconButton,
  Input,
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
import {
  OrgAgentProxyPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  TAgentProxy,
  useDeleteAgentProxy,
  useGenerateAgentProxyEnrollmentToken,
  useGetAgentProxies
} from "@app/hooks/api/agentProxies";

import { AgentProxyCreateModal } from "./components/AgentProxyCreateModal";

const AgentProxyHealthStatus = ({ heartbeat }: { heartbeat: string | null }) => {
  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;

  if (!heartbeatDate) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="warning" iconPosition="left">
            <CircleDashedIcon />
            Unregistered
          </Badge>
        </TooltipTrigger>
        <TooltipContent>This agent proxy has never checked in</TooltipContent>
      </Tooltip>
    );
  }

  // The proxy reports every minute, so anything older than five is not running.
  const isHealthy = heartbeatDate >= new Date(Date.now() - 5 * 60 * 1000);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={isHealthy ? "success" : "danger"} iconPosition="left">
          {isHealthy ? <ActivityIcon /> : <CircleXIcon />}
          {isHealthy ? "Healthy" : "Unreachable"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Last heartbeat: {heartbeatDate.toLocaleString()}</TooltipContent>
    </Tooltip>
  );
};

export const AgentProxyTab = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const [deleteConfirmation, setDeleteConfirmation] = useState("");
    const [reissuedToken, setReissuedToken] = useState<string>();

    const { data: agentProxies, isPending } = useGetAgentProxies();
    const deleteAgentProxy = useDeleteAgentProxy();
    const generateToken = useGenerateAgentProxyEnrollmentToken();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "createAgentProxy",
      "deleteAgentProxy",
      "enrollmentToken"
    ] as const);

    const handleDelete = async () => {
      const data = popUp.deleteAgentProxy.data as { id: string };
      try {
        await deleteAgentProxy.mutateAsync(data.id);
        handlePopUpToggle("deleteAgentProxy", false);
        createNotification({ type: "success", text: "Successfully deleted agent proxy" });
      } catch {
        // The shared mutation error handler surfaces the API error.
      }
    };

    const handleReissueToken = async (agentProxy: TAgentProxy) => {
      try {
        const { token } = await generateToken.mutateAsync(agentProxy.id);
        setReissuedToken(token);
        handlePopUpOpen("enrollmentToken", agentProxy);
      } catch {
        // The shared mutation error handler surfaces the API error.
      }
    };

    const filtered = agentProxies?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );
    const deleteTarget = popUp.deleteAgentProxy.data as { name?: string } | undefined;
    const confirmationName = deleteTarget?.name || "agent proxy";

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Agent Proxies</CardTitle>
          <CardDescription>
            Brokers credentials for agents on the intersection of agent and user policies
          </CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgAgentProxyPermissionActions.CreateAgentProxies}
              a={OrgPermissionSubjects.AgentProxy}
            >
              {(isAllowed: boolean) => (
                <Button
                  variant="org"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("createAgentProxy")}
                >
                  <PlusIcon />
                  Create Agent Proxy
                </Button>
              )}
            </OrgPermissionCan>
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
              placeholder="Search agent proxy..."
            />
          </InputGroup>
          {!isPending && !filtered?.length ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {agentProxies?.length ? <SearchIcon /> : <WaypointsIcon />}
                </EmptyMedia>
                <EmptyTitle>
                  {agentProxies?.length
                    ? "No agent proxies match your search"
                    : "No agent proxies configured"}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table className="min-w-[62rem] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-80 min-w-80">
                    <TableHeadLabel>Name</TableHeadLabel>
                  </TableHead>
                  <TableHead className="w-72">
                    <TableHeadLabel>Allowed Hosts</TableHeadLabel>
                  </TableHead>
                  <TableHead className="w-44">
                    <TableHeadLabel>Created</TableHeadLabel>
                  </TableHead>
                  <TableHead className="w-40">
                    <TableHeadLabel>Health Check</TableHeadLabel>
                  </TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending &&
                  ["first", "second", "third"].map((row) => (
                    <TableRow key={`agent-proxy-skeleton-${row}`}>
                      {["name", "hosts", "created", "health", "actions"].map((cell) => (
                        <TableCell key={`agent-proxy-skeleton-${row}-${cell}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {filtered?.map((el) => (
                  <TableRow key={el.id}>
                    <TableCell className="min-w-80">
                      <span className="min-w-0 flex-1 truncate">{el.name}</span>
                    </TableCell>
                    <TableCell>
                      {el.allowedHosts?.length ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="neutral" iconPosition="left">
                              <GlobeIcon />
                              {el.allowedHosts.length}{" "}
                              {el.allowedHosts.length === 1 ? "host" : "hosts"}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{el.allowedHosts.join(", ")}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatRelative(new Date(el.createdAt), new Date())}</TableCell>
                    <TableCell>
                      <AgentProxyHealthStatus heartbeat={el.heartbeat} />
                    </TableCell>
                    <TableCell className="w-12" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton aria-label="Agent proxy options" variant="ghost" size="sm">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(el.id)}>
                            <CopyIcon />
                            Copy ID
                          </DropdownMenuItem>
                          <OrgPermissionCan
                            I={OrgAgentProxyPermissionActions.EditAgentProxies}
                            a={OrgPermissionSubjects.AgentProxy}
                          >
                            {(isAllowed: boolean) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => handleReissueToken(el)}
                              >
                                <KeyIcon />
                                New Enrollment Token
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                          <OrgPermissionCan
                            I={OrgAgentProxyPermissionActions.DeleteAgentProxies}
                            a={OrgPermissionSubjects.AgentProxy}
                          >
                            {(isAllowed: boolean) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                variant="danger"
                                onClick={() => handlePopUpOpen("deleteAgentProxy", el)}
                              >
                                <TrashIcon />
                                Delete Agent Proxy
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
            open={popUp.deleteAgentProxy.isOpen}
            onOpenChange={(open) => {
              if (!open) setDeleteConfirmation("");
              handlePopUpToggle("deleteAgentProxy", open);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Agent Proxy?</AlertDialogTitle>
                <AlertDialogDescription>
                  Agents pointed at this proxy stop being able to reach anything through it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogConfirmationField>
                <Field>
                  <FieldLabel htmlFor="delete-agent-proxy-confirmation" size="sm">
                    <span>
                      Type &quot;
                      <span className="text-foreground">{confirmationName}</span>
                      &quot; to confirm.
                    </span>
                  </FieldLabel>
                  <Input
                    id="delete-agent-proxy-confirmation"
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    placeholder={confirmationName}
                    autoComplete="off"
                    autoFocus
                  />
                </Field>
              </AlertDialogConfirmationField>
              <Alert variant="danger" appearance="borderless">
                <AlertDescription>Deleting this agent proxy cannot be undone.</AlertDescription>
              </Alert>
              <AlertDialogFooter>
                <AlertDialogCancel isDisabled={deleteAgentProxy.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="danger"
                  isPending={deleteAgentProxy.isPending}
                  isDisabled={deleteConfirmation !== confirmationName}
                  onClick={(event) => {
                    event.preventDefault();
                    handleDelete();
                  }}
                >
                  Delete Agent Proxy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog
            open={popUp.enrollmentToken.isOpen}
            onOpenChange={(open) => {
              if (!open) setReissuedToken(undefined);
              handlePopUpToggle("enrollmentToken", open);
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Enrollment Token</DialogTitle>
                <DialogDescription>
                  Run this on the host that agents point their HTTP proxy at. The previous token and
                  access token stop working.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <CodeBlock
                  label="Run on the agent proxy host"
                  value={`infisical agent-proxy start --token=${reissuedToken ?? ""}`}
                />
                <Alert variant="warning" appearance="borderless">
                  <AlertDescription>
                    This token is shown once and can only be used once.
                  </AlertDescription>
                </Alert>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="org" type="button">
                      Done
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
          <AgentProxyCreateModal
            isOpen={popUp.createAgentProxy.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("createAgentProxy", isOpen)}
          />
        </CardContent>
      </Card>
    );
  },
  {
    action: OrgAgentProxyPermissionActions.ListAgentProxies,
    subject: OrgPermissionSubjects.AgentProxy
  }
);
