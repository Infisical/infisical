import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { FilterIcon, SearchIcon } from "lucide-react";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import {
  Badge,
  Card,
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { ApprovalPolicyScope, ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import {
  approvalRequestQuery,
  ApprovalRequestStatus,
  CertRequestRequestData,
  CodeSigningRequestData,
  TApprovalRequest
} from "@app/hooks/api/approvalRequests";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { ProjectType } from "@app/hooks/api/projects/types";

type StatusFilter = "pending" | "approved" | "rejected";

const STATUS_FILTERS: {
  key: StatusFilter;
  label: string;
  matches: (s: ApprovalRequestStatus) => boolean;
}[] = [
  { key: "pending", label: "Pending", matches: (s) => s === ApprovalRequestStatus.Pending },
  { key: "approved", label: "Approved", matches: (s) => s === ApprovalRequestStatus.Approved },
  {
    key: "rejected",
    label: "Rejected",
    matches: (s) =>
      s === ApprovalRequestStatus.Rejected ||
      s === ApprovalRequestStatus.Cancelled ||
      s === ApprovalRequestStatus.Expired
  }
];

const STATUS_BADGE: Record<
  ApprovalRequestStatus,
  { label: string; variant: "warning" | "success" | "danger" | "neutral" | "info" }
> = {
  [ApprovalRequestStatus.Pending]: { label: "Pending review", variant: "warning" },
  [ApprovalRequestStatus.Approved]: { label: "Approved", variant: "success" },
  [ApprovalRequestStatus.Rejected]: { label: "Rejected", variant: "danger" },
  [ApprovalRequestStatus.Cancelled]: { label: "Cancelled", variant: "neutral" },
  [ApprovalRequestStatus.Expired]: { label: "Expired", variant: "neutral" }
};

const formatRelative = (iso: string): string => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const isCertRequestData = (data: unknown): data is { requestData: CertRequestRequestData } => {
  return Boolean(
    data &&
      typeof data === "object" &&
      "requestData" in data &&
      data.requestData &&
      typeof data.requestData === "object" &&
      "profileName" in (data.requestData as object)
  );
};

const getCodeSigningData = (data: unknown): CodeSigningRequestData | null => {
  if (!data || typeof data !== "object") return null;
  const wrapped = (data as { requestData?: unknown }).requestData;
  if (wrapped && typeof wrapped === "object" && "signerName" in (wrapped as object)) {
    return wrapped as CodeSigningRequestData;
  }
  return null;
};

export const RequestsPage = () => {
  const { projectId, orgId } = useParams({ strict: false }) as {
    projectId?: string;
    orgId?: string;
  };
  const search = useSearch({ strict: false }) as { selectedTab?: string };
  const navigate = useNavigate();
  const selectedTab = search.selectedTab ?? "application-requests";

  const [statusFilters, setStatusFilters] = useState<Set<StatusFilter>>(
    () => new Set<StatusFilter>(["pending"])
  );
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch] = useDebounce(searchInput, 300);

  const [signingStatusFilters, setSigningStatusFilters] = useState<Set<StatusFilter>>(
    () => new Set<StatusFilter>(["pending"])
  );
  const [signingSearchInput, setSigningSearchInput] = useState("");
  const [debouncedSigningSearch] = useDebounce(signingSearchInput, 300);

  const toggleStatusFilter = (key: StatusFilter) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const isFiltered = statusFilters.size > 0;

  const toggleSigningStatusFilter = (key: StatusFilter) => {
    setSigningStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const isSigningFiltered = signingStatusFilters.size > 0;

  const { data: requests = [], isPending: isRequestsLoading } = useQuery(
    approvalRequestQuery.list({
      policyType: ApprovalPolicyType.CertRequest,
      scope: ApprovalPolicyScope.Project,
      scopeId: projectId ?? ""
    })
  );

  const { data: signingRequests = [], isPending: isSigningRequestsLoading } = useQuery(
    approvalRequestQuery.list({
      policyType: ApprovalPolicyType.CertCodeSigning,
      scope: ApprovalPolicyScope.Project,
      scopeId: projectId ?? ""
    })
  );

  // resolve names only for the applications actually referenced by the visible
  // requests, rather than loading the project's entire application list
  const referencedAppIds = useMemo(() => {
    const ids = new Set<string>();
    (requests as TApprovalRequest[]).forEach((r) => {
      if (r.scopeType === ApprovalPolicyScope.PkiApplication && r.scopeId) ids.add(r.scopeId);
    });
    return Array.from(ids);
  }, [requests]);

  const { data: appsResponse } = useListPkiApplications(
    { applicationIds: referencedAppIds, limit: 100 },
    { enabled: referencedAppIds.length > 0 }
  );
  const appById = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    (appsResponse?.applications ?? []).forEach((a) => map.set(a.id, { id: a.id, name: a.name }));
    return map;
  }, [appsResponse]);

  const filtered = useMemo(() => {
    const norm = debouncedSearch.trim().toLowerCase();
    const activeFilters = STATUS_FILTERS.filter((f) => statusFilters.has(f.key));
    const matchesStatus = (s: ApprovalRequestStatus) =>
      activeFilters.length === 0 || activeFilters.some((f) => f.matches(s));

    return (requests as TApprovalRequest[])
      .filter((r) => matchesStatus(r.status as ApprovalRequestStatus))
      .filter((r) => {
        if (!norm) return true;
        const cn = isCertRequestData(r.requestData)
          ? (r.requestData.requestData.certificateRequest?.commonName ?? "")
          : "";
        const profile = isCertRequestData(r.requestData)
          ? (r.requestData.requestData.profileName ?? "")
          : "";
        const requester = `${r.requesterName} ${r.requesterEmail}`;
        return (
          cn.toLowerCase().includes(norm) ||
          profile.toLowerCase().includes(norm) ||
          requester.toLowerCase().includes(norm)
        );
      });
  }, [requests, statusFilters, debouncedSearch]);

  const filteredSigning = useMemo(() => {
    const norm = debouncedSigningSearch.trim().toLowerCase();
    const activeFilters = STATUS_FILTERS.filter((f) => signingStatusFilters.has(f.key));
    const matchesStatus = (s: ApprovalRequestStatus) =>
      activeFilters.length === 0 || activeFilters.some((f) => f.matches(s));

    return (signingRequests as TApprovalRequest[])
      .filter((r) => matchesStatus(r.status as ApprovalRequestStatus))
      .filter((r) => {
        if (!norm) return true;
        const signerName = getCodeSigningData(r.requestData)?.signerName ?? "";
        const requester = `${r.requesterName} ${r.requesterEmail}`;
        return signerName.toLowerCase().includes(norm) || requester.toLowerCase().includes(norm);
      });
  }, [signingRequests, signingStatusFilters, debouncedSigningSearch]);

  return (
    <>
      <Helmet>
        <title>Requests</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.CertificateManager}
              title="Approval Requests"
              description="Review pending approval requests across your applications and signers"
            />

            <Tabs
              value={selectedTab}
              onValueChange={(v) =>
                navigate({
                  to: "/organizations/$orgId/projects/cert-manager/$projectId/requests",
                  params: { orgId: orgId ?? "", projectId: projectId ?? "" },
                  search: { selectedTab: v as "application-requests" | "signing-requests" }
                })
              }
            >
              <TabList>
                <Tab variant="project" value="application-requests">
                  Application Requests
                </Tab>
                <Tab variant="project" value="signing-requests">
                  Signing Requests
                </Tab>
              </TabList>

              <TabPanel value="application-requests">
                <Card>
                  <CardHeader>
                    <CardTitle>Application Requests</CardTitle>
                    <CardDescription>
                      Pending certificate issuance requests from your applications.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex gap-2">
                      <InputGroup className="flex-1">
                        <InputGroupAddon>
                          <SearchIcon />
                        </InputGroupAddon>
                        <InputGroupInput
                          placeholder="Search by common name, profile, or requester…"
                          value={searchInput}
                          onChange={(e) => setSearchInput(e.target.value)}
                        />
                      </InputGroup>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            aria-label="Filter by status"
                            variant={isFiltered ? "project" : "outline"}
                          >
                            <FilterIcon className="size-4" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                          {STATUS_FILTERS.map((f) => (
                            <DropdownMenuCheckboxItem
                              key={f.key}
                              checked={statusFilters.has(f.key)}
                              onClick={(e) => {
                                e.preventDefault();
                                toggleStatusFilter(f.key);
                              }}
                            >
                              {f.label}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {isRequestsLoading && (
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>Loading…</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    )}
                    {!isRequestsLoading && filtered.length === 0 && (
                      <Empty className="border">
                        <EmptyHeader>
                          <EmptyTitle>
                            {statusFilters.size === 1 && statusFilters.has("pending")
                              ? "No requests pending review"
                              : "No requests"}
                          </EmptyTitle>
                          <EmptyDescription>
                            Certificate requests from any application will appear here.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                    {!isRequestsLoading && filtered.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Common Name</TableHead>
                            <TableHead>Profile</TableHead>
                            <TableHead>Application</TableHead>
                            <TableHead>Requester</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Requested</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((r) => {
                            const certData = isCertRequestData(r.requestData)
                              ? r.requestData.requestData
                              : null;
                            const cn = certData?.certificateRequest?.commonName ?? "—";
                            const profile = certData?.profileName ?? "—";
                            const requestAppId =
                              r.scopeType === ApprovalPolicyScope.PkiApplication ? r.scopeId : null;
                            const app = requestAppId ? appById.get(requestAppId) : null;
                            const badge = STATUS_BADGE[r.status as ApprovalRequestStatus] ?? {
                              label: r.status,
                              variant: "neutral" as const
                            };

                            return (
                              <TableRow
                                key={r.id}
                                className="cursor-pointer [&>td]:py-3"
                                onClick={() =>
                                  navigate({
                                    to: "/organizations/$orgId/projects/cert-manager/$projectId/approvals/$approvalRequestId",
                                    params: {
                                      orgId: orgId ?? "",
                                      projectId: projectId ?? "",
                                      approvalRequestId: r.id
                                    },
                                    search: {
                                      policyType: ApprovalPolicyType.CertRequest,
                                      from: "root-requests"
                                    }
                                  })
                                }
                              >
                                <TableCell isTruncatable className="font-mono">
                                  {cn}
                                </TableCell>
                                <TableCell className="font-mono text-xs">{profile}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {app ? (
                                    <Link
                                      to="/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName"
                                      params={{
                                        orgId: orgId ?? "",
                                        projectId: projectId ?? "",
                                        applicationName: app.name
                                      }}
                                      className="text-foreground hover:text-project"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {app.name}
                                    </Link>
                                  ) : (
                                    <span className="text-accent">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div>{r.requesterName || "—"}</div>
                                  {r.requesterEmail ? (
                                    <div className="text-xs text-accent">{r.requesterEmail}</div>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={badge.variant}>{badge.label}</Badge>
                                </TableCell>
                                <TableCell className="text-accent">
                                  {formatRelative(r.createdAt)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabPanel>

              <TabPanel value="signing-requests">
                <Card>
                  <CardHeader>
                    <CardTitle>Signing Requests</CardTitle>
                    <CardDescription>
                      Pending code-signing requests from your signers.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex gap-2">
                      <InputGroup className="flex-1">
                        <InputGroupAddon>
                          <SearchIcon />
                        </InputGroupAddon>
                        <InputGroupInput
                          placeholder="Search by signer or requester…"
                          value={signingSearchInput}
                          onChange={(e) => setSigningSearchInput(e.target.value)}
                        />
                      </InputGroup>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            aria-label="Filter by status"
                            variant={isSigningFiltered ? "project" : "outline"}
                          >
                            <FilterIcon className="size-4" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                          {STATUS_FILTERS.map((f) => (
                            <DropdownMenuCheckboxItem
                              key={f.key}
                              checked={signingStatusFilters.has(f.key)}
                              onClick={(e) => {
                                e.preventDefault();
                                toggleSigningStatusFilter(f.key);
                              }}
                            >
                              {f.label}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {isSigningRequestsLoading && (
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>Loading…</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    )}
                    {!isSigningRequestsLoading && filteredSigning.length === 0 && (
                      <Empty className="border">
                        <EmptyHeader>
                          <EmptyTitle>
                            {signingStatusFilters.size === 1 && signingStatusFilters.has("pending")
                              ? "No requests pending review"
                              : "No requests"}
                          </EmptyTitle>
                          <EmptyDescription>
                            Code-signing requests from any signer will appear here.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                    {!isSigningRequestsLoading && filteredSigning.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Signer</TableHead>
                            <TableHead>Requester</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Requested</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSigning.map((r) => {
                            const signingData = getCodeSigningData(r.requestData);
                            const signerName = signingData?.signerName ?? "—";
                            const badge = STATUS_BADGE[r.status as ApprovalRequestStatus] ?? {
                              label: r.status,
                              variant: "neutral" as const
                            };

                            return (
                              <TableRow
                                key={r.id}
                                className="cursor-pointer [&>td]:py-3"
                                onClick={() =>
                                  navigate({
                                    to: "/organizations/$orgId/projects/cert-manager/$projectId/approvals/$approvalRequestId",
                                    params: {
                                      orgId: orgId ?? "",
                                      projectId: projectId ?? "",
                                      approvalRequestId: r.id
                                    },
                                    search: {
                                      policyType: ApprovalPolicyType.CertCodeSigning,
                                      from: "root-requests"
                                    }
                                  })
                                }
                              >
                                <TableCell isTruncatable className="font-mono">
                                  {signerName}
                                </TableCell>
                                <TableCell>{r.requesterName || r.requesterEmail || "—"}</TableCell>
                                <TableCell>
                                  <Badge variant={badge.variant}>{badge.label}</Badge>
                                </TableCell>
                                <TableCell className="text-accent">
                                  {formatRelative(r.createdAt)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabPanel>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
};
