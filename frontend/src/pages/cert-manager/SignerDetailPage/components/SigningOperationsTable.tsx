import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { HardDriveIcon, UserIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Pagination,
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
import { useOrganization } from "@app/context";
import {
  SigningActorType,
  SigningOperationStatus,
  signingOperationStatusLabels,
  TSigningOperation,
  useListSigningOperations
} from "@app/hooks/api/signers";

type Props = {
  signerId: string;
  projectId: string;
};

const PAGE_SIZE = 25;

const getStatusBadgeVariant = (status: SigningOperationStatus) => {
  switch (status) {
    case SigningOperationStatus.Success:
      return "success" as const;
    case SigningOperationStatus.Failed:
      return "danger" as const;
    case SigningOperationStatus.Denied:
      return "warning" as const;
    default:
      return "neutral" as const;
  }
};

const ALGORITHM_DISPLAY: Record<string, string> = {
  RSASSA_PKCS1_V1_5_SHA_256: "RSA PKCS#1 v1.5 (SHA-256)",
  RSASSA_PKCS1_V1_5_SHA_384: "RSA PKCS#1 v1.5 (SHA-384)",
  RSASSA_PKCS1_V1_5_SHA_512: "RSA PKCS#1 v1.5 (SHA-512)",
  RSASSA_PSS_SHA_256: "RSA-PSS (SHA-256)",
  RSASSA_PSS_SHA_384: "RSA-PSS (SHA-384)",
  RSASSA_PSS_SHA_512: "RSA-PSS (SHA-512)",
  ECDSA_SHA_256: "ECDSA (SHA-256)",
  ECDSA_SHA_384: "ECDSA (SHA-384)",
  ECDSA_SHA_512: "ECDSA (SHA-512)"
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

export const SigningOperationsTable = ({ signerId, projectId }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const { data, isLoading } = useListSigningOperations({
    signerId,
    offset: (page - 1) * perPage,
    limit: perPage
  });

  const operations = data?.operations ?? [];
  const totalCount = data?.totalCount ?? 0;

  const handleActorClick = (op: TSigningOperation) => {
    if (op.actorType === SigningActorType.User) {
      if (!op.actorMembershipId) {
        createNotification({
          type: "info",
          text: "This user is no longer a member of this project."
        });
        return;
      }
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/members/$membershipId",
        params: {
          orgId: currentOrg.id,
          projectId,
          membershipId: op.actorMembershipId
        }
      });
    } else if (op.actorType === SigningActorType.Identity) {
      if (!op.actorName) {
        createNotification({
          type: "info",
          text: "This identity is no longer a member of this project."
        });
        return;
      }
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/identities/$identityId",
        params: {
          orgId: currentOrg.id,
          projectId,
          identityId: op.actorId
        }
      });
    }
  };

  const isActorClickable = (op: TSigningOperation) => {
    if (op.actorType === SigningActorType.User) return Boolean(op.actorMembershipId);
    if (op.actorType === SigningActorType.Identity) return Boolean(op.actorName);
    return false;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signing History</CardTitle>
        <CardDescription>Trail of signing operations</CardDescription>
      </CardHeader>
      <CardContent>
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
                      <div className="h-4 w-full animate-pulse rounded bg-mineshaft-700" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading &&
              operations.map((op) => (
                <TableRow key={op.id}>
                  <TableCell>{format(new Date(op.createdAt), "MMM d, yyyy HH:mm:ss")}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(op.status)}>
                      {signingOperationStatusLabels[op.status] ?? op.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {ALGORITHM_DISPLAY[op.signingAlgorithm] ?? op.signingAlgorithm}
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate font-mono text-xs">
                    {op.dataHash}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          {op.actorType === SigningActorType.User ? (
                            <UserIcon className="text-muted-foreground size-3.5" />
                          ) : (
                            <HardDriveIcon className="text-muted-foreground size-3.5" />
                          )}
                          <button
                            type="button"
                            onClick={isActorClickable(op) ? () => handleActorClick(op) : undefined}
                            className={
                              isActorClickable(op)
                                ? "cursor-pointer font-medium text-accent underline"
                                : "text-muted-foreground"
                            }
                          >
                            {getActorDisplayName(op.actorType, op.actorName)}
                          </button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{op.actorName ?? op.actorId}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!isLoading && operations.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No signing operations yet</EmptyTitle>
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
  );
};
