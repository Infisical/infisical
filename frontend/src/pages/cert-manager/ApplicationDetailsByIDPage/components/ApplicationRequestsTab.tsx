import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
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
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import {
  approvalRequestQuery,
  ApprovalRequestStatus,
  CertRequestRequestData,
  TApprovalRequest
} from "@app/hooks/api/approvalRequests";

type Props = {
  applicationId: string;
  applicationName: string;
};

type StatusFilter = "pending" | "approved" | "rejected" | "all";

const STATUS_TABS: {
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
  },
  { key: "all", label: "All", matches: () => true }
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

export const ApplicationRequestsTab = ({ applicationId, applicationName }: Props) => {
  const params = useParams({ strict: false }) as { projectId?: string; orgId?: string };
  const { projectId, orgId } = params;
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch] = useDebounce(searchInput, 300);

  const { data: requests = [], isPending } = useQuery(
    approvalRequestQuery.list({
      policyType: ApprovalPolicyType.CertRequest,
      projectId: projectId ?? "",
      applicationId
    })
  );

  const filtered = useMemo(() => {
    const tab = STATUS_TABS.find((t) => t.key === activeStatus) ?? STATUS_TABS[0];
    const norm = debouncedSearch.trim().toLowerCase();
    return (requests as TApprovalRequest[])
      .filter((r) => tab.matches(r.status as ApprovalRequestStatus))
      .filter((r) => {
        if (!norm) return true;
        const cn = isCertRequestData(r.requestData)
          ? (r.requestData.requestData.certificateRequest?.commonName ?? "")
          : "";
        const profile = isCertRequestData(r.requestData)
          ? (r.requestData.requestData.profileName ?? "")
          : "";
        return cn.toLowerCase().includes(norm) || profile.toLowerCase().includes(norm);
      });
  }, [requests, activeStatus, debouncedSearch]);

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      all: requests.length
    };
    (requests as TApprovalRequest[]).forEach((r) => {
      const s = r.status as ApprovalRequestStatus;
      if (s === ApprovalRequestStatus.Pending) result.pending += 1;
      else if (s === ApprovalRequestStatus.Approved) result.approved += 1;
      else if (
        s === ApprovalRequestStatus.Rejected ||
        s === ApprovalRequestStatus.Cancelled ||
        s === ApprovalRequestStatus.Expired
      )
        result.rejected += 1;
    });
    return result;
  }, [requests]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate Requests</CardTitle>
        <CardDescription>
          Issuance requests for this Application. Requests gated by an approval policy land here for
          review before issuance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeStatus} onValueChange={(v) => setActiveStatus(v as StatusFilter)}>
          <TabList>
            {STATUS_TABS.map((t) => (
              <Tab key={t.key} value={t.key} variant="project">
                {t.label} ({counts[t.key]})
              </Tab>
            ))}
          </TabList>
          {STATUS_TABS.map((t) => (
            <TabPanel key={t.key} value={t.key}>
              <div className="my-4">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    placeholder="Search by SAN or CN…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </InputGroup>
              </div>

              {isPending && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Loading…</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
              {!isPending && filtered.length === 0 && (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>
                      {activeStatus === "pending" ? "No requests pending review" : "No requests"}
                    </EmptyTitle>
                    <EmptyDescription>
                      Cert-request approval workflows scoped to this Application will appear here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {!isPending && filtered.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Common Name / SAN</TableHead>
                      <TableHead>Profile</TableHead>
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
                      const badge = STATUS_BADGE[r.status as ApprovalRequestStatus] ?? {
                        label: r.status,
                        variant: "neutral" as const
                      };
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer"
                          onClick={() =>
                            navigate({
                              to: `/organizations/${orgId ?? ""}/projects/cert-manager/${projectId ?? ""}/approvals/${r.id}` as never,
                              search: {
                                policyType: ApprovalPolicyType.CertRequest,
                                applicationName
                              } as never
                            } as never)
                          }
                        >
                          <TableCell isTruncatable className="font-mono">
                            {cn}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{profile}</TableCell>
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
            </TabPanel>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};
