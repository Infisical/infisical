import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
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
  EmptyDescription,
  EmptyHeader,
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
  TableRow
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { useListGatewayPools } from "@app/hooks/api/gateway-pools";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import {
  THsmConnector,
  useListHsmConnectors,
  useTestHsmConnector
} from "@app/hooks/api/hsmConnectors";
import { PkiDocsUrls } from "@app/pages/cert-manager/pki-docs-urls";

import { CreateHsmConnectorWizard } from "./CreateHsmConnectorWizard";
import { DeleteHsmConnectorDialog } from "./DeleteHsmConnectorDialog";
import { EditHsmConnectorSheet } from "./EditHsmConnectorSheet";

export const HsmConnectorsTab = () => {
  const navigate = useNavigate();
  const { orgId, projectId } = useParams({ strict: false });
  const { subscription } = useSubscription();
  const isLicensed = Boolean(subscription?.hsm);
  const [addOpen, setAddOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<THsmConnector | null>(null);
  const [deleting, setDeleting] = useState<THsmConnector | null>(null);
  const [search, setSearch] = useState("");
  const [copiedId, , setCopiedId] = useTimedReset<string>({ initialState: "" });
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const openDetail = (connectorId: string) => {
    if (!orgId || !projectId) return;
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/hsm-connectors/$connectorId",
      params: { orgId, projectId, connectorId }
    });
  };

  const { data: connectors = [], isPending } = useListHsmConnectors({
    enabled: isLicensed
  });
  const testMutation = useTestHsmConnector();

  const { data: gateways = [] } = useQuery({ ...gatewaysQueryKeys.list(), enabled: isLicensed });
  const { data: pools = [] } = useListGatewayPools();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return connectors;
    return connectors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slotLabel.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
    );
  }, [connectors, search]);

  if (!isLicensed) {
    return (
      <div>
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-8 text-center">
          <div className="mb-3 text-2xl">&#x1f6e1;&#xfe0f;</div>
          <h4 className="mb-2 text-lg font-medium text-mineshaft-100">Enterprise Feature</h4>
          <p className="mx-auto mb-4 max-w-md text-sm text-mineshaft-300">
            HSM Connectors let Infisical use keys backed by a Hardware Security Module. Every
            cryptographic operation is routed through your HSM.
          </p>
          <Button onClick={() => setUpgradeOpen(true)}>Upgrade to Enterprise</Button>
        </div>
        <UpgradePlanModal
          isOpen={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          text="To use HSM Connectors, upgrade to Infisical's Enterprise plan."
        />
      </div>
    );
  }

  const reachedFromLabel = (c: THsmConnector) => {
    if (c.gatewayId) {
      const g = gateways.find((x) => x.id === c.gatewayId);
      return g?.name ?? c.gatewayId;
    }
    if (c.gatewayPoolId) {
      const p = pools.find((x) => x.id === c.gatewayPoolId);
      return p?.name ?? c.gatewayPoolId;
    }
    return "-";
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testMutation.mutateAsync({ connectorId: id });
      if (result.ok) {
        createNotification({
          type: "success",
          text: "HSM Connector verified. Gateway reached the HSM and the slot is online."
        });
      } else {
        const firstFailed = result.members.find((m) => !m.ok);
        createNotification({
          type: "error",
          text:
            firstFailed && !firstFailed.ok
              ? `Verify failed (${firstFailed.errorCode}): ${firstFailed.errorMessage}`
              : "Verify against the HSM failed."
        });
      }
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to verify HSM Connector"
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          HSM Connectors
          <DocumentationLinkBadge href={PkiDocsUrls.settings.hsmConnectors} />
        </CardTitle>
        <CardDescription>Connect hardware security modules to Infisical.</CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionHsmConnectorActions.Create}
            a={ProjectPermissionSub.HsmConnectors}
          >
            {(isAllowed) => (
              <Button onClick={() => setAddOpen(true)} variant="project" isDisabled={!isAllowed}>
                <PlusIcon />
                Add HSM Connector
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search HSM Connectors by name..."
            />
          </InputGroup>
        </div>
        {isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Reached from</TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-mineshaft-700"
                    onClick={() => openDetail(c.id)}
                  >
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{reachedFromLabel(c)}</TableCell>
                    <TableCell>{c.slotLabel}</TableCell>
                    <TableCell>{format(new Date(c.createdAt), "MMM d, yyyy")}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="cursor-default">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton aria-label="Actions" variant="ghost">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(c.id);
                              setCopiedId(c.id);
                            }}
                          >
                            {copiedId === c.id ? <CheckIcon /> : <CopyIcon />}
                            Copy Connector ID
                          </DropdownMenuItem>
                          <ProjectPermissionCan
                            I={ProjectPermissionHsmConnectorActions.Test}
                            a={ProjectPermissionSub.HsmConnectors}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed || testingId === c.id}
                                onClick={() => handleTest(c.id)}
                              >
                                <CheckCircle2Icon />
                                {testingId === c.id ? "Verifying..." : "Verify"}
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionHsmConnectorActions.Edit}
                            a={ProjectPermissionSub.HsmConnectors}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => setEditing(c)}
                              >
                                <PencilIcon />
                                Edit Details
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionHsmConnectorActions.Delete}
                            a={ProjectPermissionSub.HsmConnectors}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() => setDeleting(c)}
                              >
                                <Trash2Icon />
                                Delete Connector
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
            {filtered.length === 0 && (
              <Empty className="border border-solid">
                <EmptyHeader>
                  <EmptyTitle>No HSM Connectors</EmptyTitle>
                  <EmptyDescription>
                    {search
                      ? "No HSM Connectors match your search."
                      : "Add an HSM Connector to register a slot on your Hardware Security Module."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </>
        )}
      </CardContent>
      <CreateHsmConnectorWizard isOpen={addOpen} onOpenChange={setAddOpen} />
      <EditHsmConnectorSheet connector={editing} onClose={() => setEditing(null)} />
      <DeleteHsmConnectorDialog connector={deleting} onClose={() => setDeleting(null)} />
    </Card>
  );
};
