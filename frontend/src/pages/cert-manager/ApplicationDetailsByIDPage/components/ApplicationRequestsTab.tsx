import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";

import { Spinner, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
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
import {
  CertificateRequestStatus,
  TListCertificateRequestsParams,
  useListCertificateRequests
} from "@app/hooks/api/certificates";
import { TPkiApplicationProfile } from "@app/hooks/api/pkiApplications";

type Props = {
  profiles: TPkiApplicationProfile[];
};

type StatusTab = "pending" | "issued" | "rejected" | "all";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

const TABS: { key: StatusTab; label: string; statuses: CertificateRequestStatus[] | null }[] = [
  {
    key: "pending",
    label: "Pending",
    statuses: [
      CertificateRequestStatus.PENDING_APPROVAL,
      CertificateRequestStatus.PENDING,
      CertificateRequestStatus.PENDING_VALIDATION
    ]
  },
  { key: "issued", label: "Issued", statuses: [CertificateRequestStatus.ISSUED] },
  {
    key: "rejected",
    label: "Rejected",
    statuses: [CertificateRequestStatus.REJECTED, CertificateRequestStatus.FAILED]
  },
  { key: "all", label: "All", statuses: null }
];

const STATUS_BADGE: Record<CertificateRequestStatus, { label: string; variant: BadgeVariant }> = {
  [CertificateRequestStatus.PENDING_APPROVAL]: {
    label: "Approval required",
    variant: "warning"
  },
  [CertificateRequestStatus.PENDING]: { label: "Pending", variant: "neutral" },
  [CertificateRequestStatus.PENDING_VALIDATION]: { label: "Validating", variant: "info" },
  [CertificateRequestStatus.ISSUED]: { label: "Issued", variant: "success" },
  [CertificateRequestStatus.FAILED]: { label: "Failed", variant: "danger" },
  [CertificateRequestStatus.REJECTED]: { label: "Rejected", variant: "danger" }
};

const formatRelative = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export const ApplicationRequestsTab = ({ profiles }: Props) => {
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [pendingSearch, setPendingSearch] = useState("");
  const [debouncedSearch] = useDebounce(pendingSearch, 400);

  const profileIds = useMemo(() => profiles.map((p) => p.profileId), [profiles]);

  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  const queryParams: TListCertificateRequestsParams = useMemo(
    () => ({
      offset: 0,
      limit: 100,
      search: debouncedSearch || undefined,
      profileIds: profileIds.length > 0 ? profileIds : undefined
    }),
    [debouncedSearch, profileIds]
  );

  const { data, isPending } = useListCertificateRequests(queryParams);

  const filtered = useMemo(() => {
    const all = data?.certificateRequests ?? [];
    if (!tab.statuses) return all;
    return all.filter((r) => tab.statuses!.includes(r.status as CertificateRequestStatus));
  }, [data, tab]);

  const counts = useMemo(() => {
    const all = data?.certificateRequests ?? [];
    const result: Record<StatusTab, number> = {
      pending: 0,
      issued: 0,
      rejected: 0,
      all: all.length
    };
    all.forEach((r) => {
      const s = r.status as CertificateRequestStatus;
      if (
        s === CertificateRequestStatus.PENDING_APPROVAL ||
        s === CertificateRequestStatus.PENDING ||
        s === CertificateRequestStatus.PENDING_VALIDATION
      ) {
        result.pending += 1;
      } else if (s === CertificateRequestStatus.ISSUED) {
        result.issued += 1;
      } else if (s === CertificateRequestStatus.REJECTED || s === CertificateRequestStatus.FAILED) {
        result.rejected += 1;
      }
    });
    return result;
  }, [data]);

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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StatusTab)}>
          <TabList>
            {TABS.map((t) => (
              <Tab
                key={t.key}
                value={t.key}
                variant="project"
                data-testid={`requests-tab-${t.key}`}
              >
                {t.label} ({counts[t.key]})
              </Tab>
            ))}
          </TabList>

          {TABS.map((t) => (
            <TabPanel key={t.key} value={t.key}>
              <div className="mt-4 mb-4">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    placeholder="Search by SAN or CN…"
                    data-testid="requests-search"
                  />
                </InputGroup>
              </div>

              {isPending && !data && (
                <div className="flex items-center justify-center p-8">
                  <Spinner />
                </div>
              )}
              {(!isPending || data) && filtered.length === 0 && (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>
                      {activeTab === "pending" ? "No requests pending" : "No requests"}
                    </EmptyTitle>
                    <EmptyDescription>
                      Certificate issuance requests scoped to this Application&apos;s profiles will
                      appear here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {(!isPending || data) && filtered.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Common Name / SAN</TableHead>
                      <TableHead>Profile</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const badge =
                        STATUS_BADGE[r.status as CertificateRequestStatus] ??
                        ({ label: r.status, variant: "neutral" } as const);
                      return (
                        <TableRow key={r.id}>
                          <TableCell isTruncatable>
                            <div className="font-mono text-foreground">{r.commonName ?? "—"}</div>
                            {r.altNames ? (
                              <div className="font-mono text-xs text-accent">{r.altNames}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.profileName ?? "—"}
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
