import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { FolderOpen, SearchIcon, ShieldCheck } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useListPamPendingMyApproval } from "@app/hooks/api/pam";
import { TPamAccessRequest } from "@app/hooks/api/pam/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { getRequestStatusInfo } from "../components/approvalRequestStatus";
import { AccountPlatformIcon } from "../PamAccessPage/components/AccountPlatformIcon";
import { ApprovalRequestDetailSheet } from "./components/ApprovalRequestDetailSheet";

const RequestRow = ({
  request,
  onSelect
}: {
  request: TPamAccessRequest;
  onSelect: (r: TPamAccessRequest) => void;
}) => {
  const status = getRequestStatusInfo(request);
  const duration = request.requestData?.requestData?.duration;

  return (
    <TableRow onClick={() => onSelect(request)} className="cursor-pointer">
      <TableCell className="h-[50px]">
        <div className="flex flex-col">
          <span className="text-sm">{request.requesterName}</span>
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
      <TableCell className="text-sm">{request.folderName ?? "-"}</TableCell>
      <TableCell className="max-w-[200px] truncate text-sm">
        {request.requestData?.requestData?.reason || "-"}
      </TableCell>
      <TableCell className="text-sm">{duration ?? "-"}</TableCell>
      <TableCell className="text-sm">
        {format(new Date(request.createdAt), "MMM d, yyyy h:mm a")}
      </TableCell>
      <TableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
    </TableRow>
  );
};

const RequestTable = ({
  requests,
  isPending,
  search,
  onSelect
}: {
  requests: TPamAccessRequest[];
  isPending: boolean;
  search: string;
  onSelect: (r: TPamAccessRequest) => void;
}) => {
  const query = search.trim().toLowerCase();
  const filtered = query
    ? requests.filter((r) =>
        `${r.requesterName} ${r.requesterEmail} ${r.accountName ?? ""} ${r.folderName ?? ""}`
          .toLowerCase()
          .includes(query)
      )
    : requests;

  if (!isPending && filtered.length === 0) {
    return (
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {search ? "No requests match your search" : "No requests found"}
            </EmptyTitle>
            <EmptyDescription>
              {search
                ? "Try adjusting your search."
                : "Requests awaiting your approval will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Requester</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Folder</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending &&
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={`skeleton-${i + 1}`}>
              {Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={`cell-${j + 1}`}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        {filtered.map((request) => (
          <RequestRow key={request.id} request={request} onSelect={onSelect} />
        ))}
      </TableBody>
    </Table>
  );
};

export const PamApprovalRequestsPage = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedRequest, setSelectedRequest] = useState<TPamAccessRequest | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("pamApprovalRequestsTable", PreferenceKey.PerPage, 20)
  );

  const { data: pendingRequests, isPending } = useListPamPendingMyApproval();

  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<string, unknown>;
  const requestId = searchParams.requestId as string | undefined;

  // Deep link from approval emails: open the sheet for the request named in the URL once it loads.
  useEffect(() => {
    if (!requestId || !pendingRequests) return;
    const match = pendingRequests.find((r) => r.id === requestId);
    if (match) setSelectedRequest(match);
  }, [requestId, pendingRequests]);

  const clearRequestIdParam = () => {
    if (!requestId) return;
    const rest = Object.fromEntries(Object.entries(searchParams).filter(([k]) => k !== "requestId"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ search: rest as any, replace: true });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const folderOptions = useMemo(() => {
    const map = new Map<string, string>();
    (pendingRequests ?? []).forEach((r) => {
      const folderId = r.requestData?.requestData?.folderId;
      if (folderId) map.set(folderId, r.folderName ?? folderId);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [pendingRequests]);

  const requests = (pendingRequests ?? []).filter(
    (r) => !selectedFolderId || r.requestData?.requestData?.folderId === selectedFolderId
  );
  const totalCount = requests.length;
  const offset = (page - 1) * perPage;
  const paginatedRequests = requests.slice(offset, offset + perPage);

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Approval Requests" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.PAM}
        icon={ShieldCheck}
        title="Approval Requests"
        description="Review access requests that are awaiting your approval."
      />

      <Card className="mt-4">
        <CardContent className="flex items-center gap-4">
          <div className="flex-1">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={handleSearchChange}
                placeholder="Search by requester, account, or folder..."
              />
            </InputGroup>
          </div>
          <Select
            value={selectedFolderId || "all"}
            onValueChange={(val) => {
              setSelectedFolderId(val === "all" ? "" : val);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <FolderOpen className="mr-1.5 size-4 text-muted" />
              <SelectValue placeholder="All folders" />
            </SelectTrigger>
            <SelectContent position="popper" align="end" sideOffset={4}>
              <SelectItem value="all">All folders</SelectItem>
              {folderOptions.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>

        <RequestTable
          requests={paginatedRequests}
          isPending={isPending}
          search={search}
          onSelect={setSelectedRequest}
        />

        {totalCount > perPage && (
          <CardContent>
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={(newPerPage) => {
                setPerPage(newPerPage);
                setPage(1);
                setUserTablePreference(
                  "pamApprovalRequestsTable",
                  PreferenceKey.PerPage,
                  newPerPage
                );
              }}
            />
          </CardContent>
        )}
      </Card>

      <ApprovalRequestDetailSheet
        request={selectedRequest}
        isOpen={!!selectedRequest}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
            clearRequestIdParam();
          }
        }}
      />
    </div>
  );
};
