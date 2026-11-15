import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { CaStatus } from "@app/hooks/api/ca/enums";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import type {
  THsmConnector,
  THsmConnectorLinkedCertificate,
  THsmConnectorLinkedCertificateAuthority
} from "@app/hooks/api/hsmConnectors/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, saved, toast } from "../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { useCertManagerProjectId } from "../components/certificate";
import { EditHsmConnectorSheet } from "../SettingsPage/hsm-connector-edit-sheet";
import { DeleteHsmConnectorDialog } from "../SettingsPage/hsm-connectors";

const routeId = v4Path("/organizations/$orgId/cert-manager/hsm-connectors/$connectorId");

const timestamp = (value: string) => format(new Date(value), "MMM d, yyyy 'at' h:mm a");

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const statusLabel = (status: string) => capitalize(status.replace(/-/g, " "));

const KeyLabel = ({ value }: { value: string | null }) =>
  value ? <span title={value}>{value}</span> : <Muted>-</Muted>;

const LinkedResources = ({ orgId, connectorId }: { orgId: string; connectorId: string }) => {
  const go = useGo();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, isPending } = useV4Adapter("hsmConnectors").useLinkedResources(connectorId, {
    offset: (page - 1) * pageSize,
    limit: pageSize
  });
  const certificates = data?.certificates ?? [];
  const authorities = data?.certificateAuthorities ?? [];
  const totalCount = data?.totalCount ?? 0;

  const caColumns: DataTableColumn<THsmConnectorLinkedCertificateAuthority>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      render: (ca) => (
        <RowLink link={go.link(orgHref(orgId, `/cert-manager/ca/${ca.id}`))} title={ca.name}>
          {ca.name}
        </RowLink>
      )
    },
    { id: "type", header: "Type", width: 120, render: (ca) => capitalize(ca.type) },
    {
      id: "status",
      header: "Status",
      width: 180,
      render: (ca) => (
        <Badge tone={ca.status === CaStatus.ACTIVE ? "ok" : "outline"} dot>
          {statusLabel(ca.status)}
        </Badge>
      )
    },
    {
      id: "key-label",
      header: "HSM key label",
      mono: true,
      width: 240,
      render: (ca) => <KeyLabel value={ca.hsmKeyLabel} />
    }
  ];

  const certificateColumns: DataTableColumn<THsmConnectorLinkedCertificate>[] = [
    {
      id: "common-name",
      header: "Common name",
      primary: true,
      grow: true,
      render: (cert) => (
        <RowLink
          link={go.link(
            orgHref(orgId, `/cert-manager/certificates/${cert.id}?fromHsmConnector=${connectorId}`)
          )}
          title={cert.commonName}
        >
          {cert.commonName}
        </RowLink>
      )
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (cert) => (
        <Badge tone={cert.status === CertStatus.ACTIVE ? "ok" : "outline"} dot>
          {statusLabel(cert.status)}
        </Badge>
      )
    },
    {
      id: "key-label",
      header: "HSM key label",
      mono: true,
      width: 240,
      render: (cert) => <KeyLabel value={cert.hsmKeyLabel} />
    },
    {
      id: "expires",
      header: "Expires",
      width: 140,
      render: (cert) => (cert.notAfter ? format(new Date(cert.notAfter), "MMM d, yyyy") : "-")
    }
  ];

  if (isPending)
    return (
      <Card variant="framed" flush title="Certificates">
        <DataTable
          label="Linked certificates"
          rows={certificates}
          columns={certificateColumns}
          getRowId={(cert) => cert.id}
          rowLabel={(cert) => cert.commonName}
          loading
          loadingRows={3}
        />
      </Card>
    );

  if (!authorities.length && !totalCount)
    return (
      <Card variant="framed" title="Linked resources">
        <EmptyState
          size="sm"
          icon="key"
          title="No linked resources"
          description="No certificate or certificate authority uses this connector, so you can delete it."
        />
      </Card>
    );

  return (
    <>
      {authorities.length > 0 && (
        <Card variant="framed" flush title="Certificate authorities">
          <DataTable
            label="Linked certificate authorities"
            rows={authorities}
            columns={caColumns}
            getRowId={(ca) => ca.id}
            rowLabel={(ca) => ca.name}
          />
        </Card>
      )}
      {totalCount > 0 && (
        <Card variant="framed" flush title="Certificates">
          <DataTable
            label="Linked certificates"
            rows={certificates}
            columns={certificateColumns}
            getRowId={(cert) => cert.id}
            rowLabel={(cert) => cert.commonName}
            pagination={
              totalCount > pageSize ? (
                <Pagination
                  label="Linked certificate pages"
                  variant="compact"
                  page={page}
                  onPageChange={setPage}
                  total={totalCount}
                  pageSize={pageSize}
                  pageSizeOptions={[20, 50, 100]}
                  onPageSizeChange={(next) => {
                    setPageSize(next);
                    setPage(1);
                  }}
                />
              ) : undefined
            }
          />
        </Card>
      )}
    </>
  );
};

const ConnectorDetail = ({
  orgId,
  projectId,
  connector
}: {
  orgId: string;
  projectId: string;
  connector: THsmConnector;
}) => {
  const go = useGo();
  const settings = useV4Adapter("certManagerSettings");
  const { permission } = useProjectPermission(projectId);
  const { data: plan } = settings.useHsmPlan(orgId);
  const { data: gateways = [] } = settings.useHsmAllGateways({
    enabled: Boolean(connector.gatewayId)
  });
  const { data: pools = [] } = settings.useHsmGatewayPools({
    enabled: Boolean(connector.gatewayPoolId)
  });
  const test = settings.useTestHsmConnector();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const listHref = orgHref(orgId, "/cert-manager/settings?selectedTab=hsm-connectors");

  const blocked = (action: ProjectPermissionHsmConnectorActions) =>
    permission.can(action, ProjectPermissionSub.HsmConnectors) ? undefined : RESTRICTED;
  const testBlocked =
    blocked(ProjectPermissionHsmConnectorActions.Test) ??
    (test.isPending ? "Verifying" : undefined);
  const editBlocked =
    blocked(ProjectPermissionHsmConnectorActions.Edit) ?? (plan ? undefined : "Loading your plan");
  const deleteBlocked = blocked(ProjectPermissionHsmConnectorActions.Delete);

  const reachedFrom = () => {
    if (connector.gatewayId)
      return gateways.find((entry) => entry.id === connector.gatewayId)?.name ?? "(deleted)";
    if (connector.gatewayPoolId)
      return pools.find((entry) => entry.id === connector.gatewayPoolId)?.name ?? "(deleted)";
    return "-";
  };

  const verify = async () => {
    const result = await test.mutateAsync({ connectorId: connector.id }).catch((error: unknown) => {
      failed(`Couldn't verify ${connector.name}`, error);
      return undefined;
    });
    if (!result) return;
    if (result.ok) {
      toast({
        tone: "ok",
        title: `HSM connector ${connector.name} verified`,
        description: "The gateway reached the HSM and the slot is online."
      });
      return;
    }
    const firstFailed = result.members.find((member) => !member.ok);
    toast({
      tone: "bad",
      title: `Couldn't verify ${connector.name}`,
      description:
        firstFailed && !firstFailed.ok
          ? `${firstFailed.errorCode}: ${firstFailed.errorMessage}`
          : "The verify against the HSM failed."
    });
  };

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[{ label: "HSM connectors", link: go.link(listHref) }]}
        title={connector.name}
        description={connector.description || undefined}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button layout="trigger" variant="outline" icon="more">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(connector.id).catch(() => undefined);
                    saved("Connector ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy connector ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={Boolean(editBlocked)}
                  description={editBlocked}
                  onSelect={() => setEditing(true)}
                >
                  <Icon name="pencil" />
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(deleteBlocked)}
                  description={deleteBlocked}
                  onSelect={() => setDeleting(true)}
                >
                  <Icon name="trash" />
                  Delete connector
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="primary"
              icon="check-c"
              loading={test.isPending}
              disabledReason={blocked(ProjectPermissionHsmConnectorActions.Test)}
              disabled={Boolean(testBlocked)}
              onClick={verify}
            >
              Verify
            </Button>
          </>
        }
      />
      <DetailLayout
        asideLabel="HSM connector details"
        aside={
          <Card variant="framed" title="Details">
            <DataList
              variant="props"
              density="compact"
              items={[
                ["Connector ID", <code key="id">{connector.id}</code>],
                ["Reached from", reachedFrom()],
                ["Slot label", <code key="slot">{connector.slotLabel}</code>],
                [
                  "Key label prefix",
                  connector.keyNamePrefix ? (
                    <code key="prefix">{connector.keyNamePrefix}</code>
                  ) : (
                    <Muted key="prefix">-</Muted>
                  )
                ],
                ...(connector.createdAt
                  ? ([["Created", timestamp(connector.createdAt)]] as const)
                  : []),
                ...(connector.updatedAt
                  ? ([["Last updated", timestamp(connector.updatedAt)]] as const)
                  : [])
              ]}
            />
          </Card>
        }
      >
        <LinkedResources orgId={orgId} connectorId={connector.id} />
      </DetailLayout>
      {plan && (
        <EditHsmConnectorSheet
          connector={editing ? connector : undefined}
          plan={plan}
          onClose={() => setEditing(false)}
        />
      )}
      <DeleteHsmConnectorDialog
        connector={deleting ? connector : undefined}
        onClose={() => setDeleting(false)}
        onDeleted={() => go(listHref)}
      />
    </Stack>
  );
};

const Page = () => {
  const { orgId, connectorId } = useParams({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const { permission, isPending: isCheckingAccess } = useProjectPermission(projectId ?? "");
  const { data: connector, isPending } = useV4Adapter("hsmConnectors").useHsmConnector(connectorId);
  if (isResolving || isCheckingAccess || isPending)
    return <Loader size="page" label="Loading HSM connector" />;
  if (
    !permission.can(ProjectPermissionHsmConnectorActions.Read, ProjectPermissionSub.HsmConnectors)
  )
    return <AccessRestricted requirement="Read HSM connectors" />;
  if (!connector || !projectId)
    return (
      <EmptyState
        icon="key"
        title="HSM connector not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/settings?selectedTab=hsm-connectors")}>
              Back to HSM connectors
            </a>
          </Button>
        }
      />
    );
  return <ConnectorDetail orgId={orgId} projectId={projectId} connector={connector} />;
};

export const HsmConnectorDetailsByIDPage = () => (
  <>
    <PageTitle title="HSM Connector" />
    <Page />
  </>
);
