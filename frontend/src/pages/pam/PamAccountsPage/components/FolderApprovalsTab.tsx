import { useEffect, useMemo, useState } from "react";
import { components, OptionProps } from "react-select";
import { format } from "date-fns";
import { Ban, FilterIcon, Trash2, User as UserIcon, Users as UsersIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
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
  FilterableSelect,
  IconButton,
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
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useGetOrganizationGroups } from "@app/hooks/api/organization/queries";
import {
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  useGetPamApprovalConfig,
  useListFolderMembers,
  useListPamAccessRequests,
  usePamFolderPermission,
  useRevokePamAccessRequest,
  useSetPamApprovalConfig
} from "@app/hooks/api/pam";
import { TPamAccessRequest } from "@app/hooks/api/pam/types";
import { useGetOrgUsers } from "@app/hooks/api/users/queries";

import { getRequestStatusInfo, isGrantActive } from "../../components/approvalRequestStatus";
import { formatRelativeExpiry } from "../../components/PamDetailSheet";
import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";
import { ApprovalRequestDetailSheet } from "../../PamApprovalRequestsPage/components/ApprovalRequestDetailSheet";

const RelativeTime = ({ date }: { date: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="cursor-default">{formatRelativeExpiry(date).replace("about ", "")}</span>
    </TooltipTrigger>
    <TooltipContent>{format(new Date(date), "MMM d, yyyy h:mm a")}</TooltipContent>
  </Tooltip>
);

type ApproverEntry = { type: "user" | "group"; id: string };

type ApproverOption = {
  value: string;
  label: string;
  kind: "user" | "group";
  subtitle: string;
};

const KIND_ICON: Record<"user" | "group", typeof UserIcon> = {
  user: UserIcon,
  group: UsersIcon
};

const ApproverSelectOption = ({ children, ...props }: OptionProps<ApproverOption>) => {
  const Icon = KIND_ICON[props.data.kind];
  return (
    <components.Option {...props}>
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="truncate">{children}</p>
          {props.data.subtitle && (
            <p className="truncate text-xs leading-4 text-muted">{props.data.subtitle}</p>
          )}
        </div>
      </div>
    </components.Option>
  );
};

type Props = {
  folderId: string;
  onDirtyChange?: (isDirty: boolean) => void;
};

export const FolderApprovalsTab = ({ folderId, onDirtyChange }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: config, isLoading } = useGetPamApprovalConfig(folderId);
  const { data: orgUsers } = useGetOrgUsers(currentOrg.id);
  const { data: orgGroups } = useGetOrganizationGroups(currentOrg.id);
  const { data: folderMembers } = useListFolderMembers(folderId);
  const setConfig = useSetPamApprovalConfig();

  const [requestsPage, setRequestsPage] = useState(1);
  const [requestsPerPage, setRequestsPerPage] = useState(() =>
    getUserTablePreference("pamFolderAccessRequestsTable", PreferenceKey.PerPage, 10)
  );
  const [requestsStatusFilter, setRequestsStatusFilter] = useState<string>("all");
  const { data: requestsData } = useListPamAccessRequests({
    folderId,
    status: requestsStatusFilter === "all" ? undefined : requestsStatusFilter,
    offset: (requestsPage - 1) * requestsPerPage,
    limit: requestsPerPage
  });
  const folderRequests = requestsData?.requests ?? [];
  const requestsTotalCount = requestsData?.totalCount ?? 0;

  const { data: folderPerm } = usePamFolderPermission(folderId);
  const canRevoke = !!folderPerm?.permission.can(
    PamResourcePermissionActions.RevokeGrants,
    PamResourcePermissionSub.PamResource
  );
  const revokeMutation = useRevokePamAccessRequest();
  const [requestToRevoke, setRequestToRevoke] = useState<TPamAccessRequest | null>(null);

  const confirmRevoke = async () => {
    if (!requestToRevoke) return;
    await revokeMutation.mutateAsync({ requestId: requestToRevoke.id });
    createNotification({ text: "Access revoked", type: "success" });
    setRequestToRevoke(null);
  };

  const [approvers, setApprovers] = useState<ApproverEntry[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TPamAccessRequest | null>(null);

  const savedApprovers = useMemo(() => {
    if (!config?.steps?.[0]) return [];
    return config.steps[0].approvers.map((a) => ({ type: a.type, id: a.id }));
  }, [config]);

  useEffect(() => {
    setApprovers(savedApprovers);
    setIsDirty(false);
  }, [savedApprovers]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const selectedIds = useMemo(
    () => new Set(approvers.map((a) => `${a.type}:${a.id}`)),
    [approvers]
  );

  const userMap = useMemo(
    () =>
      new Map(
        (orgUsers ?? []).map((ou) => [
          ou.user.id,
          {
            label:
              [ou.user.firstName, ou.user.lastName].filter(Boolean).join(" ") || ou.user.username,
            email: ou.user.email ?? ou.inviteEmail ?? ou.user.username
          }
        ])
      ),
    [orgUsers]
  );

  const groupMap = useMemo(
    () => new Map((orgGroups ?? []).map((g) => [g.id, g.name])),
    [orgGroups]
  );

  // Approvers must be members of the folder, so the picker only offers folder members.
  const memberUserIds = useMemo(
    () => new Set((folderMembers?.users ?? []).map((m) => m.userId).filter(Boolean)),
    [folderMembers]
  );
  const memberGroupIds = useMemo(
    () => new Set((folderMembers?.groups ?? []).map((m) => m.groupId).filter(Boolean)),
    [folderMembers]
  );

  const approverOptions = useMemo<ApproverOption[]>(() => {
    const groups: ApproverOption[] = (orgGroups ?? [])
      .filter((g) => memberGroupIds.has(g.id) && !selectedIds.has(`group:${g.id}`))
      .map((g) => ({ value: g.id, label: g.name, kind: "group" as const, subtitle: "Group" }));

    const users: ApproverOption[] = (orgUsers ?? [])
      .filter(
        (ou) =>
          ou.user.id && memberUserIds.has(ou.user.id) && !selectedIds.has(`user:${ou.user.id}`)
      )
      .map((ou) => {
        const name = [ou.user.firstName, ou.user.lastName].filter(Boolean).join(" ");
        return {
          value: ou.user.id,
          label: name || ou.user.email || ou.inviteEmail || ou.user.username,
          kind: "user" as const,
          subtitle: ou.user.email ?? ou.inviteEmail ?? ""
        };
      });

    return [...groups, ...users];
  }, [orgGroups, orgUsers, selectedIds, memberUserIds, memberGroupIds]);

  const addApprover = (opt: ApproverOption | null) => {
    if (!opt) return;
    setApprovers((prev) => [...prev, { type: opt.kind, id: opt.value }]);
    setIsDirty(true);
  };

  const removeApprover = (index: number) => {
    setApprovers((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleSave = () => {
    setConfig.mutate(
      { folderId, steps: [{ approvers }] },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: "Approval configuration saved" });
          setIsDirty(false);
        },
        onError: () => {
          createNotification({ type: "error", text: "Failed to save approval configuration" });
        }
      }
    );
  };

  const handleDiscard = () => {
    setApprovers(savedApprovers);
    setIsDirty(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">
            Approvers
            <Badge variant="pam">{approvers.length}</Badge>
          </CardTitle>
          <CardDescription>
            Users and groups who can approve access requests for accounts in this folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FilterableSelect
            value={null}
            options={approverOptions}
            onChange={(opt) => addApprover(opt as ApproverOption | null)}
            getOptionValue={(opt) => `${opt.kind}:${opt.value}`}
            getOptionLabel={(opt) => opt.label}
            components={{ Option: ApproverSelectOption }}
            placeholder="Add a user or group..."
            noOptionsMessage={() => "No users or groups available to add."}
          />

          {approvers.length === 0 ? (
            <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
              No approvers configured.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Approver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvers.map((approver, idx) => {
                  const Icon = KIND_ICON[approver.type];
                  const displayName =
                    approver.type === "user"
                      ? (userMap.get(approver.id)?.label ?? approver.id)
                      : (groupMap.get(approver.id) ?? approver.id);
                  const subtitle =
                    approver.type === "user" ? userMap.get(approver.id)?.email : undefined;

                  return (
                    <TableRow key={`${approver.type}-${approver.id}`} className="h-14">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Icon className="size-4 shrink-0 text-muted" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{displayName}</span>
                            {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">
                          {approver.type === "user" ? "User" : "Group"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label="Remove approver"
                          className="text-muted hover:text-danger"
                          onClick={() => removeApprover(idx)}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">
            Access Requests
            <Badge variant="pam">{requestsTotalCount}</Badge>
          </CardTitle>
          <CardDescription>
            All access requests submitted for accounts in this folder.
          </CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label="Filter requests"
                  variant={requestsStatusFilter !== "all" ? "project" : "outline"}
                  className={twMerge(requestsStatusFilter !== "all" && "text-primary")}
                >
                  <FilterIcon />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={2}>
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                {[
                  { value: "all", label: "All" },
                  { value: "pending", label: "Pending Review" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" }
                ].map((opt) => (
                  <DropdownMenuCheckboxItem
                    key={opt.value}
                    checked={requestsStatusFilter === opt.value}
                    onSelect={(e) => {
                      e.preventDefault();
                      setRequestsStatusFilter(opt.value);
                      setRequestsPage(1);
                    }}
                  >
                    {opt.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent>
          {requestsTotalCount === 0 ? (
            <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
              No access requests have been submitted for this folder.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requester</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Status</TableHead>
                    {canRevoke && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folderRequests.map((request) => {
                    const status = getRequestStatusInfo(request);
                    const duration = request.requestData?.requestData?.duration;
                    return (
                      <TableRow
                        key={request.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedRequest(request)}
                      >
                        <TableCell className="h-[50px]">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{request.requesterName}</span>
                            <span className="text-xs text-muted">{request.requesterEmail}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {request.accountType && (
                              <AccountPlatformIcon accountType={request.accountType} size={16} />
                            )}
                            {request.accountName ?? "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <RelativeTime date={request.createdAt} />
                            {duration && <span className="text-xs text-muted">for {duration}</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        {canRevoke && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {isGrantActive(request) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <IconButton
                                    variant="ghost"
                                    size="xs"
                                    aria-label="Revoke access"
                                    className="text-muted hover:text-danger"
                                    onClick={() => setRequestToRevoke(request)}
                                  >
                                    <Ban className="size-4" />
                                  </IconButton>
                                </TooltipTrigger>
                                <TooltipContent>Revoke access</TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {requestsTotalCount > requestsPerPage && (
            <Pagination
              count={requestsTotalCount}
              page={requestsPage}
              perPage={requestsPerPage}
              onChangePage={setRequestsPage}
              onChangePerPage={(newPerPage) => {
                setRequestsPerPage(newPerPage);
                setRequestsPage(1);
                setUserTablePreference(
                  "pamFolderAccessRequestsTable",
                  PreferenceKey.PerPage,
                  newPerPage
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <ApprovalRequestDetailSheet
        request={selectedRequest}
        isOpen={!!selectedRequest}
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null);
        }}
      />

      <DeleteActionModal
        isOpen={!!requestToRevoke}
        onChange={(open) => {
          if (!open) setRequestToRevoke(null);
        }}
        title="Revoke Access"
        subTitle="Are you sure you want to revoke this grant? Any active session using it will be terminated immediately."
        deleteKey="revoke"
        buttonText="Revoke"
        onDeleteApproved={confirmRevoke}
      />

      <div aria-hidden className="h-8 shrink-0" />
      {isDirty && (
        <div className="sticky bottom-0 -mx-4 mt-auto -mb-4 flex items-center justify-end gap-2 border-t border-border bg-popover px-4 py-3">
          <Button type="button" variant="ghost" onClick={handleDiscard}>
            Discard
          </Button>
          <Button variant="pam" isPending={setConfig.isPending} onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
};
