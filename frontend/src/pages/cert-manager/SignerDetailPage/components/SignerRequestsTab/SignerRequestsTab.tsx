import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { FilterIcon, MessageSquareTextIcon, XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  PageLoader,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import {
  SIGNER_TABLE_PAGE_SIZE,
  SignerRequestStatus,
  TSignerRequest,
  useGetSignerPolicy,
  useListEffectiveSignerMembers,
  useListSignerMembers,
  useListSignerRequests
} from "@app/hooks/api/signers";

import { PreApproveSigningModal } from "../PreApproveSigningModal";
import { RequestToSignModal } from "../RequestToSignModal";
import { ExpiresCell } from "./ExpiresCell";
import { KindIcon } from "./KindIcon";
import { RevokeRequestDialog } from "./RevokeRequestDialog";
import {
  FILTER_OPTIONS,
  FilterStatus,
  labelForIdentity,
  labelForUser,
  MemberDescriptor,
  statusLabel,
  statusVariant
} from "./types";

type Props = {
  signerId: string;
  canPreApprove: boolean;
  canRequestSign: boolean;
};

export const SignerRequestsTab = ({ signerId, canPreApprove, canRequestSign }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [statusFilters, setStatusFilters] = useState<Set<FilterStatus>>(new Set());
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isPreApproveOpen, setIsPreApproveOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(SIGNER_TABLE_PAGE_SIZE);
  const [revokeTarget, setRevokeTarget] = useState<TSignerRequest | null>(null);

  const toggleStatusFilter = (status: FilterStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };
  const isTableFiltered = statusFilters.size > 0;

  const statusesParam = useMemo(
    () => (statusFilters.size ? Array.from(statusFilters) : undefined),
    [statusFilters]
  );
  const { data, isLoading } = useListSignerRequests({
    signerId,
    statuses: statusesParam,
    offset: (page - 1) * perPage,
    limit: perPage
  });
  const requests = data?.requests ?? [];
  const totalCount = data?.totalCount ?? 0;
  const users = useListSignerMembers({ signerId, kind: "user" });
  const identities = useListSignerMembers({ signerId, kind: "identity" });
  const effectiveUsers = useListEffectiveSignerMembers({ signerId, kind: "user" });
  const effectiveIdentities = useListEffectiveSignerMembers({ signerId, kind: "identity" });
  const { data: policy } = useGetSignerPolicy(signerId);
  const hasPolicy = policy?.hasSteps ?? false;

  const userIndex = useMemo(() => {
    const map = new Map<string, MemberDescriptor>();
    (effectiveUsers.data?.members ?? []).forEach((m) => {
      if (!m.actorUserId) return;
      const label = m.details?.name || m.details?.username || m.details?.email || m.actorUserId;
      map.set(m.actorUserId, { label, kind: "user" });
    });
    (users.data?.memberships ?? []).forEach((m) => {
      if (m.actorUserId && !map.has(m.actorUserId)) map.set(m.actorUserId, labelForUser(m));
    });
    return map;
  }, [users.data, effectiveUsers.data]);

  const identityIndex = useMemo(() => {
    const map = new Map<string, MemberDescriptor>();
    (effectiveIdentities.data?.members ?? []).forEach((m) => {
      if (!m.actorIdentityId) return;
      map.set(m.actorIdentityId, {
        label: m.details?.name || m.actorIdentityId,
        kind: "identity"
      });
    });
    (identities.data?.memberships ?? []).forEach((m) => {
      if (m.actorIdentityId && !map.has(m.actorIdentityId))
        map.set(m.actorIdentityId, labelForIdentity(m));
    });
    return map;
  }, [identities.data, effectiveIdentities.data]);

  const resolveMember = (req: TSignerRequest): MemberDescriptor => {
    if (req.requesterId) {
      return (
        userIndex.get(req.requesterId) ?? {
          label: req.requesterName || req.requesterId,
          kind: "user"
        }
      );
    }
    if (req.machineIdentityId) {
      return (
        identityIndex.get(req.machineIdentityId) ?? {
          label: req.requesterName || req.machineIdentityId,
          kind: "identity"
        }
      );
    }
    return { label: req.requesterName || "Unknown", kind: "user" };
  };

  useEffect(() => {
    setPage(1);
  }, [statusFilters, perPage]);

  if (isLoading && !data) return <PageLoader />;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            See who can sign right now, and any past requests ever made.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              {hasPolicy &&
                (canPreApprove ? (
                  <Button variant="outline" onClick={() => setIsPreApproveOpen(true)}>
                    Pre-approve signing
                  </Button>
                ) : (
                  canRequestSign && (
                    <Button variant="outline" onClick={() => setIsRequestOpen(true)}>
                      Request to sign
                    </Button>
                  )
                ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    aria-label="Filter requests"
                    variant={isTableFiltered ? "project" : "outline"}
                    className={twMerge(isTableFiltered && "text-primary")}
                  >
                    <FilterIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={2}>
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  {FILTER_OPTIONS.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={statusFilters.has(opt.value)}
                      onSelect={(e) => {
                        e.preventDefault();
                        toggleStatusFilter(opt.value);
                      }}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {totalCount === 0 ? (
            <Empty className="border border-solid">
              <EmptyHeader>
                <EmptyTitle>{hasPolicy ? "No requests" : "No approval policy"}</EmptyTitle>
                <EmptyDescription>
                  {/* eslint-disable-next-line no-nested-ternary */}
                  {!hasPolicy
                    ? "No approval policy is in place — any member can sign directly without requesting approval."
                    : canRequestSign
                      ? "Open a request to sign to get started."
                      : "Once requests are opened, they will appear here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-32">When</TableHead>
                  <TableHead className="w-44">Expires</TableHead>
                  <TableHead className="w-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req: TSignerRequest) => {
                  const member = resolveMember(req);
                  const isRevocable =
                    req.status === SignerRequestStatus.Pending ||
                    req.status === SignerRequestStatus.Approved;
                  const created = new Date(req.createdAt);
                  return (
                    <TableRow
                      key={req.id}
                      className="group cursor-pointer transition-colors hover:bg-mineshaft-700 [&>td]:py-3"
                      onClick={() =>
                        navigate({
                          to: "/organizations/$orgId/projects/cert-manager/$projectId/approvals/$approvalRequestId",
                          params: {
                            orgId: currentOrg.id,
                            projectId: currentProject.id,
                            approvalRequestId: req.id
                          },
                          search: {
                            policyType: ApprovalPolicyType.CertCodeSigning,
                            signerId
                          }
                        })
                      }
                    >
                      <TableCell isTruncatable>
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-mineshaft-800">
                            <KindIcon kind={member.kind} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-foreground">{member.label}</div>
                            {req.justification && (
                              <div className="mt-0.5 max-w-full text-xs text-muted">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="inline-flex max-w-full items-center gap-1 align-middle"
                                      aria-label={`Reason: ${req.justification}`}
                                    >
                                      <MessageSquareTextIcon
                                        className="size-3 shrink-0"
                                        aria-hidden
                                      />
                                      <span className="truncate">{req.justification}</span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-md break-words whitespace-pre-wrap">
                                    <span className="block text-[10px] tracking-wide text-muted uppercase">
                                      Reason
                                    </span>
                                    {req.justification}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(req.status)}>{statusLabel(req.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-accent">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{format(created, "MMM d, yyyy")}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {format(created, "MMM d, yyyy 'at' h:mm:ss a")}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-accent">
                        <ExpiresCell req={req} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isRevocable && canPreApprove && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                onClick={() => setRevokeTarget(req)}
                                aria-label={
                                  req.status === SignerRequestStatus.Pending
                                    ? "Cancel the pending request"
                                    : "Cancel the active approval"
                                }
                                className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                              >
                                <XIcon />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent>
                              {req.status === SignerRequestStatus.Pending
                                ? "Cancel the pending request"
                                : "Cancel the active approval"}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {totalCount > 0 && (
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

      <RequestToSignModal
        isOpen={isRequestOpen}
        onOpenChange={setIsRequestOpen}
        signerId={signerId}
      />
      <PreApproveSigningModal
        isOpen={isPreApproveOpen}
        onOpenChange={setIsPreApproveOpen}
        signerId={signerId}
      />
      <RevokeRequestDialog
        signerId={signerId}
        target={revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      />
    </TooltipProvider>
  );
};
