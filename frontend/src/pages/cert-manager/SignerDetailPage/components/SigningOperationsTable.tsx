import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { HardDriveIcon, UserIcon } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Pagination,
  RowLink,
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
import { useProject } from "@app/context";
import {
  getSigningOperationStatusBadgeVariant,
  SIGNER_TABLE_PAGE_SIZE,
  SigningActorType,
  signingAlgorithmLabels,
  signingOperationStatusLabels,
  TSigner,
  TSigningOperation,
  useListSigningOperations
} from "@app/hooks/api/signers";

import { getCertManagerLink } from "../../cert-manager-link";
import { ConnectToSignerDrawer } from "./ConnectToSignerDrawer";

type Props = {
  signer: TSigner;
  signerId: string;
};

const getActorDisplayName = (actorType: SigningActorType, actorName?: string | null) => {
  if (actorName) return actorName;

  switch (actorType) {
    case SigningActorType.User:
      return "Deleted User";
    case SigningActorType.Identity:
      return "Deleted Identity";
    default:
      return "Unknown";
  }
};

export const SigningOperationsTable = ({ signer, signerId }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(SIGNER_TABLE_PAGE_SIZE);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const { currentProject } = useProject();

  const { data, isLoading } = useListSigningOperations({
    signerId,
    offset: (page - 1) * perPage,
    limit: perPage
  });

  const operations = data?.operations ?? [];
  const totalCount = data?.totalCount ?? 0;

  const renderActorName = (op: TSigningOperation) => {
    const actorName = getActorDisplayName(op.actorType, op.actorName);
    const linkClassName = "font-medium text-accent underline";

    if (op.actorType === SigningActorType.User && op.actorMembershipId) {
      return (
        <Link
          {...getCertManagerLink(currentProject, `members/${op.actorId}`)}
          className={linkClassName}
        >
          {actorName}
        </Link>
      );
    }
    if (op.actorType === SigningActorType.Identity && op.actorName) {
      return (
        <Link
          {...getCertManagerLink(currentProject, `identities/${op.actorId}`)}
          className={linkClassName}
        >
          {actorName}
        </Link>
      );
    }
    return <span className="text-muted">{actorName}</span>;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Signing History</CardTitle>
          <CardDescription>Trail of signing operations on this signer.</CardDescription>
          <CardAction>
            <Button variant="neutral" size="sm" onClick={() => setIsConnectOpen(true)}>
              Set up signing
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {(isLoading || operations.length > 0) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Algorithm</TableHead>
                  <TableHead>Data Hash</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`skeleton-${i}`}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <TableCell key={`skeleton-cell-${j}`}>
                          <div className="h-4 w-full animate-pulse rounded bg-surface-hover" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!isLoading &&
                  operations.map((op) => (
                    <TableRow
                      key={op.id}
                      linked
                      className="transition-colors hover:bg-surface-hover [&>td]:py-3"
                    >
                      <TableCell>
                        <RowLink
                          {...getCertManagerLink(
                            currentProject,
                            `code-signing/${signerId}/operations/${op.id}`
                          )}
                        >
                          {format(new Date(op.createdAt), "MMM d, yyyy HH:mm:ss")}
                        </RowLink>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSigningOperationStatusBadgeVariant(op.status)}>
                          {signingOperationStatusLabels[op.status] ?? op.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {signingAlgorithmLabels[op.signingAlgorithm] ?? op.signingAlgorithm}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate font-mono text-xs">
                        {op.dataHash}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5">
                              {op.actorType === SigningActorType.User ? (
                                <UserIcon className="size-3.5 text-muted" />
                              ) : (
                                <HardDriveIcon className="size-3.5 text-muted" />
                              )}
                              {renderActorName(op)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>{op.actorName ?? op.actorId}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && operations.length === 0 && (
            <Empty className="border border-solid">
              <EmptyHeader>
                <EmptyTitle>No signing activity yet</EmptyTitle>
                <EmptyDescription>
                  Set up a signing tool on your machine to start signing with this Signer.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {Boolean(totalCount) && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
          )}
        </CardContent>
      </Card>
      <ConnectToSignerDrawer
        signer={signer}
        isOpen={isConnectOpen}
        onOpenChange={setIsConnectOpen}
      />
    </>
  );
};
