import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { Link } from "@tanstack/react-router";

import {
  SigningActorType,
  signingAlgorithmLabels,
  SigningOperationStatus,
  signingOperationStatusLabels,
  type TSigner,
  type TSigningOperation
} from "@app/hooks/api/signers/types";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";
import { dateTimeSeconds, SIGNERS_PAGE_SIZE } from "../CodeSigningPage/signer-shared";
import { ConnectSignerSheet } from "./connect-sheet";

const OPERATION_TONES: Record<SigningOperationStatus, "ok" | "bad" | "warn" | "outline"> = {
  [SigningOperationStatus.Success]: "ok",
  [SigningOperationStatus.Failed]: "bad",
  [SigningOperationStatus.Denied]: "warn",
  [SigningOperationStatus.Pending]: "outline"
};

export const OperationStatusBadge = ({ status }: { status: SigningOperationStatus }) => (
  <Badge tone={OPERATION_TONES[status] ?? "outline"} dot>
    {signingOperationStatusLabels[status] ?? status}
  </Badge>
);

export const actorName = (operation: TSigningOperation) => {
  if (operation.actorName) return operation.actorName;
  if (operation.actorType === SigningActorType.User) return "Deleted user";
  if (operation.actorType === SigningActorType.Identity) return "Deleted identity";
  return "Unknown";
};

export const actorHref = (orgId: string, operation: TSigningOperation) => {
  if (operation.actorType === SigningActorType.User && operation.actorMembershipId)
    return orgHref(orgId, `/cert-manager/members/${operation.actorMembershipId}`);
  if (operation.actorType === SigningActorType.Identity && operation.actorName)
    return orgHref(orgId, `/cert-manager/identities/${operation.actorId}`);
  return undefined;
};

export const ActivityTab = ({
  orgId,
  signer,
  canExportCertificate
}: {
  orgId: string;
  signer: TSigner;
  canExportCertificate: boolean;
}) => {
  const go = useGo();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SIGNERS_PAGE_SIZE);
  const [connecting, setConnecting] = useState(false);
  const { data, isPending, error } = useV4Adapter("codeSigning").useSigningOperations({
    signerId: signer.id,
    offset: (page - 1) * pageSize,
    limit: pageSize
  });
  const rows = data?.operations ?? [];
  const total = data?.totalCount ?? 0;
  const href = (operation: TSigningOperation) =>
    orgHref(orgId, `/cert-manager/code-signing/${signer.id}/operations/${operation.id}`);

  const columns: DataTableColumn<TSigningOperation>[] = [
    {
      id: "timestamp",
      header: "Timestamp",
      primary: true,
      width: 200,
      text: (operation) => dateTimeSeconds(operation.createdAt),
      render: (operation) => (
        <RowLink link={go.link(href(operation))} title={dateTimeSeconds(operation.createdAt)}>
          {dateTimeSeconds(operation.createdAt)}
        </RowLink>
      )
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (operation) => <OperationStatusBadge status={operation.status} />
    },
    {
      id: "algorithm",
      header: "Algorithm",
      width: 200,
      render: (operation) =>
        signingAlgorithmLabels[operation.signingAlgorithm] ?? operation.signingAlgorithm,
      text: (operation) =>
        signingAlgorithmLabels[operation.signingAlgorithm] ?? operation.signingAlgorithm
    },
    {
      id: "hash",
      header: "Data hash",
      grow: true,
      minWidth: 160,
      mono: true,
      render: (operation) => operation.dataHash,
      text: (operation) => operation.dataHash
    },
    {
      id: "actor",
      header: "Actor",
      width: 200,
      render: (operation) => {
        const target = actorHref(orgId, operation);
        return (
          <Tooltip content={operation.actorName ?? operation.actorId}>
            <Inline gap={6} align="center" wrap={false}>
              <Icon name={operation.actorType === SigningActorType.User ? "user" : "machine"} />
              {target ? (
                <Link {...go.link(target)}>{actorName(operation)}</Link>
              ) : (
                <span>{actorName(operation)}</span>
              )}
            </Inline>
          </Tooltip>
        );
      }
    }
  ];

  return (
    <Card
      variant="framed"
      title="Signing history"
      action={
        <Button variant="outline" icon="terminal" onClick={() => setConnecting(true)}>
          Set up signing
        </Button>
      }
      flush
    >
      <DataTable
        label="Signing history"
        rows={rows}
        columns={columns}
        loading={isPending && !error}
        getRowId={(operation) => operation.id}
        rowLabel={(operation) => dateTimeSeconds(operation.createdAt)}
        empty={
          error ? (
            <EmptyState
              size="sm"
              icon="alert-c"
              title="Couldn't load signing history"
              description={error instanceof Error ? error.message : undefined}
            />
          ) : (
            <EmptyState
              size="sm"
              icon="activity"
              title="No signing activity yet"
              description="Set up a signing tool on your machine to start signing with this signer."
            />
          )
        }
        persistentStatus={
          total ? `${total} ${total === 1 ? "operation" : "operations"}` : undefined
        }
        pagination={
          total > pageSize ? (
            <Pagination
              label="Signing history pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={total}
              pageSize={pageSize}
              pageSizeOptions={[25, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      {connecting && (
        <ConnectSignerSheet
          signer={signer}
          canExportCertificate={canExportCertificate}
          onClose={() => setConnecting(false)}
        />
      )}
    </Card>
  );
};
