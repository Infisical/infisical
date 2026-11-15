import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge, Count } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format } from "date-fns";
import { FilterIcon } from "lucide-react";

import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";
import {
  SignerRequestStatus,
  type TSignerRequest,
  type TSignerRequestStatusFilter
} from "@app/hooks/api/signers/types";

import { failed } from "../../access/toast";
import { Muted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";
import { dateOnly, memberLabel, SIGNERS_PAGE_SIZE } from "../CodeSigningPage/signer-shared";
import { SignerPolicySheet } from "./policy-sheet";
import { SignerRequestSheet } from "./request-sheet";

const FILTERS: { value: TSignerRequestStatusFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" }
];

const STATUS: Record<string, { label: string; tone: "warn" | "ok" | "bad" | "outline" }> = {
  [SignerRequestStatus.Pending]: { label: "Pending", tone: "warn" },
  [SignerRequestStatus.Approved]: { label: "Active", tone: "ok" },
  [SignerRequestStatus.Cancelled]: { label: "Revoked", tone: "bad" },
  [SignerRequestStatus.Rejected]: { label: "Rejected", tone: "bad" },
  [SignerRequestStatus.Expired]: { label: "Expired", tone: "outline" }
};

const compactDuration = (ms: number) => {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const fullTime = (value: string) => format(new Date(value), "MMM d, yyyy 'at' h:mm a");

const expiryOf = (request: TSignerRequest) => {
  if (request.status === SignerRequestStatus.Pending) return { label: "Awaiting approval" };
  if (!request.grantStatus) return undefined;
  const access = request.accessStatus ?? request.status;
  const windowEnded =
    Boolean(request.expiresAt) && new Date(request.expiresAt!).getTime() <= Date.now();
  const max = request.maxSignings ?? null;
  const left = max != null ? Math.max(0, max - (request.usedSignings ?? 0)) : null;
  const usage =
    left != null && max != null
      ? `${left} of ${max} signing${max === 1 ? "" : "s"} left`
      : "Unlimited signings";
  if (
    access === SignerRequestStatus.Cancelled ||
    (request.grantStatus === "expired" && !windowEnded)
  )
    return {
      label: access === SignerRequestStatus.Cancelled ? "Grant revoked" : "Grant expired",
      usage,
      tooltip: request.expiresAt ? fullTime(request.expiresAt) : "Grant no longer active"
    };
  if (!request.expiresAt) return { label: "No expiry", usage, tooltip: "No time limit" };
  const diff = new Date(request.expiresAt).getTime() - Date.now();
  return {
    label:
      diff < 0 ? `Expired ${compactDuration(-diff)} ago` : `Expires in ${compactDuration(diff)}`,
    usage,
    tooltip: fullTime(request.expiresAt)
  };
};

const RevokeRequestDialog = ({
  signerId,
  target,
  onClose
}: {
  signerId: string;
  target?: TSignerRequest;
  onClose: () => void;
}) => {
  const revoke = useV4Adapter("codeSigning").useRevokeSignerRequest();
  const [pending, setPending] = useState(false);
  const isPending = target?.status === SignerRequestStatus.Pending;
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(next) => !next && !pending && onClose()}>
      <AlertDialogContent tone="danger" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPending ? "Cancel pending request?" : "Revoke active approval?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isPending
              ? "The request is cancelled and the member can't sign under it. They can request again any time."
              : "The approval is revoked immediately and any remaining signings under it are blocked. Signing again needs a new approval."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!target) return;
              setPending(true);
              try {
                await revoke.mutateAsync({ signerId, requestId: target.id });
              } catch (error) {
                failed(
                  isPending ? "Couldn't cancel the request" : "Couldn't revoke the approval",
                  error
                );
                return;
              } finally {
                setPending(false);
              }
              onClose();
            }}
          >
            {isPending ? "Cancel request" : "Revoke approval"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const PolicyCard = ({
  signerId,
  canManagePolicy,
  standalone
}: {
  signerId: string;
  canManagePolicy: boolean;
  standalone?: boolean;
}) => {
  const adapter = useV4Adapter("codeSigning");
  const { data: policy } = adapter.useSignerPolicy(signerId);
  const users = adapter.useSignerMembers({ signerId, kind: "user" });
  const groups = adapter.useSignerMembers({ signerId, kind: "group" });
  const [editing, setEditing] = useState(false);
  const labels = new Map(
    [...(users.data?.memberships ?? []), ...(groups.data?.memberships ?? [])].map((member) => [
      member.actorUserId ?? member.actorGroupId ?? "",
      memberLabel(member)
    ])
  );
  const reason = canManagePolicy
    ? undefined
    : "Requires the Manage policy permission on this signer";
  const sheet = (
    <SignerPolicySheet
      open={editing}
      signerId={signerId}
      policy={policy}
      onClose={() => setEditing(false)}
    />
  );

  if (!policy?.hasSteps)
    return (
      <Card variant="framed" title={standalone ? "Approvals" : "Approval policy"}>
        <EmptyState
          size="sm"
          icon="shield"
          title="No approval policy"
          description="Any member can sign directly until you add approvers."
          actions={
            <Button
              variant="outline"
              icon="plus"
              disabledReason={reason}
              onClick={() => setEditing(true)}
            >
              Add policy
            </Button>
          }
        />
        {sheet}
      </Card>
    );

  return (
    <Card
      variant="framed"
      title="Approval policy"
      action={
        <Button
          variant="ghost"
          size="sm"
          icon="pencil"
          aria-label="Edit policy"
          disabledReason={reason}
          onClick={() => setEditing(true)}
        />
      }
    >
      <Stack gap={16}>
        <DataList
          variant="props"
          density="compact"
          items={[
            [
              "Max signings",
              policy.constraints.maxSignings ?? <Muted key="unlimited">Unlimited</Muted>
            ],
            [
              "Max window",
              policy.constraints.maxWindowDuration ?? <Muted key="none">No limit</Muted>
            ]
          ]}
        />
        <DataList
          variant="props"
          density="compact"
          items={policy.steps.map((step, index) => [
            step.name || `Step ${step.stepNumber ?? index + 1}`,
            <Stack
              key={`${step.stepNumber ?? ""}:${step.approvers.map((approver) => approver.id).join(",")}`}
              gap={4}
            >
              <span>
                {step.approvers
                  .map((approver) => labels.get(approver.id) ?? `${approver.id.slice(0, 8)}...`)
                  .join(", ")}
              </span>
              <Muted>{`${step.requiredApprovals} required`}</Muted>
            </Stack>
          ])}
        />
      </Stack>
      {sheet}
    </Card>
  );
};

const RequestsCard = ({
  orgId,
  signerId,
  canPreApprove,
  canRequestSign,
  hasPolicy
}: {
  orgId: string;
  signerId: string;
  canPreApprove: boolean;
  canRequestSign: boolean;
  hasPolicy: boolean;
}) => {
  const go = useGo();
  const adapter = useV4Adapter("codeSigning");
  const [filters, setFilters] = useState<TSignerRequestStatusFilter[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SIGNERS_PAGE_SIZE);
  const [sheet, setSheet] = useState<"request" | "pre-approve">();
  const [revoking, setRevoking] = useState<TSignerRequest>();
  const { data, isPending, error } = adapter.useSignerRequests({
    signerId,
    statuses: filters.length ? filters : undefined,
    offset: (page - 1) * pageSize,
    limit: pageSize
  });
  const users = adapter.useEffectiveSignerMembers({ signerId, kind: "user" });
  const identities = adapter.useEffectiveSignerMembers({ signerId, kind: "identity" });
  const names = new Map<string, { label: string; kind: "user" | "identity" }>();
  (users.data?.members ?? []).forEach((member) => {
    if (member.actorUserId)
      names.set(member.actorUserId, {
        label:
          member.details?.name ||
          member.details?.username ||
          member.details?.email ||
          member.actorUserId,
        kind: "user"
      });
  });
  (identities.data?.members ?? []).forEach((member) => {
    if (member.actorIdentityId)
      names.set(member.actorIdentityId, {
        label: member.details?.name || member.actorIdentityId,
        kind: "identity"
      });
  });
  const requester = (request: TSignerRequest) => {
    const id = request.requesterId ?? request.machineIdentityId;
    const known = id ? names.get(id) : undefined;
    return {
      label: known?.label ?? (request.requesterName || id || "Unknown"),
      kind: known?.kind ?? (request.machineIdentityId ? "identity" : "user")
    };
  };
  const rows = data?.requests ?? [];
  const total = data?.totalCount ?? 0;
  const href = (request: TSignerRequest) =>
    orgHref(
      orgId,
      `/cert-manager/approvals/${request.id}?policyType=${ApprovalPolicyType.CertCodeSigning}&signerId=${signerId}`
    );

  const columns: DataTableColumn<TSignerRequest>[] = [
    {
      id: "member",
      header: "Member",
      primary: true,
      grow: true,
      minWidth: 220,
      text: (request) => requester(request).label,
      secondary: (request) => request.justification || undefined,
      render: (request) => {
        const who = requester(request);
        return (
          <Inline gap={8} align="center" wrap={false}>
            <Icon name={who.kind === "identity" ? "machine" : "user"} />
            <RowLink link={go.link(href(request))} title={who.label}>
              {who.label}
            </RowLink>
          </Inline>
        );
      }
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (request) => {
        const status = STATUS[request.accessStatus ?? request.status] ?? {
          label: request.status,
          tone: "outline" as const
        };
        return (
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        );
      }
    },
    {
      id: "when",
      header: "When",
      width: 140,
      render: (request) => (
        <Tooltip content={format(new Date(request.createdAt), "MMM d, yyyy 'at' h:mm:ss a")}>
          <span>{dateOnly(request.createdAt)}</span>
        </Tooltip>
      )
    },
    {
      id: "expires",
      header: "Expires",
      width: 200,
      render: (request) => {
        const expiry = expiryOf(request);
        if (!expiry) return null;
        const body = (
          <Stack gap={2}>
            <span>{expiry.label}</span>
            {expiry.usage && <Muted>{expiry.usage}</Muted>}
          </Stack>
        );
        return expiry.tooltip ? <Tooltip content={expiry.tooltip}>{body}</Tooltip> : body;
      }
    }
  ];

  let primaryAction;
  if (hasPolicy && canPreApprove)
    primaryAction = (
      <Button variant="outline" onClick={() => setSheet("pre-approve")}>
        Pre-approve signing
      </Button>
    );
  else if (hasPolicy && canRequestSign)
    primaryAction = (
      <Button variant="outline" onClick={() => setSheet("request")}>
        Request to sign
      </Button>
    );

  let emptyDescription = "Requests appear here once someone opens one.";
  if (!hasPolicy)
    emptyDescription =
      "There's no approval policy, so any member can sign directly without a request.";
  else if (canRequestSign) emptyDescription = "Open a request to sign to get started.";

  return (
    <Card
      variant="framed"
      title="Requests"
      flush
      action={
        <Inline gap={8} align="center">
          {primaryAction}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="Filter requests by status">
                <Icon icon={FilterIcon} />
                {filters.length > 0 && <Count tone="ink">{filters.length}</Count>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {FILTERS.map((filter) => (
                <DropdownMenuCheckboxItem
                  key={filter.value}
                  checked={filters.includes(filter.value)}
                  onSelect={(event) => {
                    event.preventDefault();
                    setPage(1);
                    setFilters((current) =>
                      current.includes(filter.value)
                        ? current.filter((entry) => entry !== filter.value)
                        : [...current, filter.value]
                    );
                  }}
                >
                  {filter.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Inline>
      }
    >
      <DataTable
        label="Signing requests"
        rows={rows}
        columns={columns}
        loading={isPending && !error}
        getRowId={(request) => request.id}
        rowLabel={(request) => requester(request).label}
        empty={
          filters.length ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No requests match these filters"
              actions={
                <Button variant="link" onClick={() => setFilters([])}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              icon="inbox"
              title={hasPolicy ? "No requests" : "No approval policy"}
              description={emptyDescription}
            />
          )
        }
        rowActions={{
          renderMenu: (request) => {
            const access = request.accessStatus ?? request.status;
            const isActive =
              access === SignerRequestStatus.Pending || access === SignerRequestStatus.Approved;
            let blocked: string | undefined;
            if (!isActive) blocked = "This request is no longer active";
            else if (!canPreApprove) blocked = RESTRICTED;
            return (
              <DropdownMenuItem
                variant="destructive"
                disabled={Boolean(blocked)}
                description={blocked}
                onSelect={() => setRevoking(request)}
              >
                <Icon name="x" />
                {request.status === SignerRequestStatus.Pending
                  ? "Cancel request"
                  : "Revoke approval"}
              </DropdownMenuItem>
            );
          }
        }}
        persistentStatus={total ? `${total} ${total === 1 ? "request" : "requests"}` : undefined}
        pagination={
          total > pageSize ? (
            <Pagination
              label="Request pages"
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
      <SignerRequestSheet signerId={signerId} mode={sheet} onClose={() => setSheet(undefined)} />
      <RevokeRequestDialog
        signerId={signerId}
        target={revoking}
        onClose={() => setRevoking(undefined)}
      />
    </Card>
  );
};

export const ApprovalsTab = ({
  orgId,
  signerId,
  canManagePolicy,
  canPreApprove,
  canRequestSign
}: {
  orgId: string;
  signerId: string;
  canManagePolicy: boolean;
  canPreApprove: boolean;
  canRequestSign: boolean;
}) => {
  const adapter = useV4Adapter("codeSigning");
  const { data: policy, isPending: policyPending } = adapter.useSignerPolicy(signerId);
  const { data: requests, isPending: requestsPending } = adapter.useSignerRequests({
    signerId,
    offset: 0,
    limit: SIGNERS_PAGE_SIZE
  });
  if (policyPending || requestsPending) return <Loader label="Loading approvals" />;
  if (!policy?.hasSteps && requests?.totalCount === 0)
    return <PolicyCard signerId={signerId} canManagePolicy={canManagePolicy} standalone />;
  return (
    <DetailLayout
      asideLabel="Approval policy"
      aside={<PolicyCard signerId={signerId} canManagePolicy={canManagePolicy} />}
    >
      <RequestsCard
        orgId={orgId}
        signerId={signerId}
        canPreApprove={canPreApprove}
        canRequestSign={canRequestSign}
        hasPolicy={Boolean(policy?.hasSteps)}
      />
    </DetailLayout>
  );
};
