import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import {
  Badge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useListNhiIdentities, useListNhiSources } from "@app/hooks/api/nhi";
import { NhiIdentityType, NhiProvider } from "@app/hooks/api/nhi/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useDebounce } from "@app/hooks/useDebounce";

const ALL_FILTER = "all";

const PROVIDER_IMAGE_MAP: Record<string, string> = {
  [NhiProvider.AWS]: "Amazon Web Services.png",
  [NhiProvider.GitHub]: "GitHub.png",
  [NhiProvider.GCP]: "Google Cloud Platform.png"
};

const PROVIDER_OPTIONS = [
  { label: "All Providers", value: ALL_FILTER },
  { label: "AWS", value: NhiProvider.AWS, image: PROVIDER_IMAGE_MAP[NhiProvider.AWS] },
  { label: "GitHub", value: NhiProvider.GitHub, image: PROVIDER_IMAGE_MAP[NhiProvider.GitHub] },
  { label: "GCP", value: NhiProvider.GCP, image: PROVIDER_IMAGE_MAP[NhiProvider.GCP] }
];

const RISK_LEVEL_OPTIONS = [
  { label: "All Risk Levels", value: ALL_FILTER },
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" }
];

const TYPE_OPTIONS = [
  { label: "All Types", value: ALL_FILTER },
  { label: "IAM User", value: NhiIdentityType.IamUser },
  { label: "IAM Role", value: NhiIdentityType.IamRole },
  { label: "IAM Access Key", value: NhiIdentityType.IamAccessKey },
  { label: "GitHub App", value: NhiIdentityType.GitHubAppInstallation },
  { label: "Deploy Key", value: NhiIdentityType.GitHubDeployKey },
  { label: "Fine-grained PAT", value: NhiIdentityType.GitHubFinegrainedPat },
  { label: "GCP Service Account", value: NhiIdentityType.GcpServiceAccount },
  { label: "GCP SA Key", value: NhiIdentityType.GcpServiceAccountKey },
  { label: "GCP API Key", value: NhiIdentityType.GcpApiKey }
];

const STATUS_OPTIONS = [
  { label: "All Statuses", value: ALL_FILTER },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Flagged", value: "flagged" }
];

const OWNER_OPTIONS = [
  { label: "All Owners", value: ALL_FILTER },
  { label: "Assigned", value: "assigned" },
  { label: "Unassigned", value: "unassigned" }
];

const PAGE_SIZE = 25;

const formatIdentityType = (type: string) => {
  switch (type) {
    case NhiIdentityType.IamUser:
      return "IAM User";
    case NhiIdentityType.IamRole:
      return "IAM Role";
    case NhiIdentityType.IamAccessKey:
      return "Access Key";
    case NhiIdentityType.GitHubAppInstallation:
      return "GitHub App";
    case NhiIdentityType.GitHubDeployKey:
      return "Deploy Key";
    case NhiIdentityType.GitHubFinegrainedPat:
      return "Fine-grained PAT";
    case NhiIdentityType.GcpServiceAccount:
      return "Service Account";
    case NhiIdentityType.GcpServiceAccountKey:
      return "SA Key";
    case NhiIdentityType.GcpApiKey:
      return "API Key";
    default:
      return type;
  }
};

const getRiskBadgeVariant = (score: number) => {
  if (score >= 70) return "danger" as const;
  if (score >= 40) return "warning" as const;
  if (score >= 20) return "info" as const;
  return "success" as const;
};

const getRiskLabel = (score: number) => {
  if (score >= 70) return "Critical";
  if (score >= 40) return "High";
  if (score >= 20) return "Medium";
  return "Low";
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "active":
      return "success" as const;
    case "flagged":
      return "warning" as const;
    case "inactive":
      return "neutral" as const;
    default:
      return "neutral" as const;
  }
};

const getProviderImagePath = (provider: string) => {
  const filename = PROVIDER_IMAGE_MAP[provider];
  if (!filename) return null;
  return `/images/integrations/${filename}`;
};

export const NhiIdentitiesPage = () => {
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState(ALL_FILTER);
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const [providerFilter, setProviderFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
  const [ownerFilter, setOwnerFilter] = useState(ALL_FILTER);
  const [page, setPage] = useState(1);

  const [debouncedSearch] = useDebounce(search, 300);

  const { data: sources } = useListNhiSources(currentProject.id);

  const { data, isPending } = useListNhiIdentities({
    projectId: currentProject.id,
    search: debouncedSearch || undefined,
    riskLevel: riskLevel !== ALL_FILTER ? riskLevel : undefined,
    type: typeFilter !== ALL_FILTER ? typeFilter : undefined,
    provider: providerFilter !== ALL_FILTER ? providerFilter : undefined,
    status: statusFilter !== ALL_FILTER ? statusFilter : undefined,
    sourceId: sourceFilter !== ALL_FILTER ? sourceFilter : undefined,
    ownerFilter: ownerFilter !== ALL_FILTER ? ownerFilter : undefined,
    page,
    limit: PAGE_SIZE,
    sortBy: "riskScore",
    sortDir: "desc"
  });

  const identities = data?.identities ?? [];
  const totalCount = data?.totalCount ?? 0;

  const totalPages = useMemo(() => Math.ceil(totalCount / PAGE_SIZE), [totalCount]);

  const sourceOptions = useMemo(() => {
    const base = [{ label: "All Sources", value: ALL_FILTER, provider: "" }];
    if (!sources) return base;
    return base.concat(
      sources.map((source) => ({ label: source.name, value: source.id, provider: source.provider }))
    );
  }, [sources]);

  return (
    <>
      <Helmet>
        <title>Identity - Identities</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.NHI}
        title="Identities"
        description="Discovered non-human identities across your cloud sources."
      />

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <InputGroup className="min-w-[200px] flex-1">
          <InputGroupAddon>
            <SearchIcon size={14} />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or external ID..."
          />
        </InputGroup>
        <Select
          value={providerFilter}
          onValueChange={(val) => {
            setProviderFilter(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40 text-mineshaft-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex items-center gap-2">
                  {opt.image && (
                    <img
                      src={`/images/integrations/${opt.image}`}
                      alt={opt.label}
                      className="h-4 w-4"
                    />
                  )}
                  {opt.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sourceFilter}
          onValueChange={(val) => {
            setSourceFilter(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52 text-mineshaft-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sourceOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex items-center gap-2">
                  {opt.provider && getProviderImagePath(opt.provider) && (
                    <img
                      src={getProviderImagePath(opt.provider)!}
                      alt={opt.provider}
                      className="h-4 w-4"
                    />
                  )}
                  {opt.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={riskLevel}
          onValueChange={(val) => {
            setRiskLevel(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44 text-mineshaft-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RISK_LEVEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={typeFilter}
          onValueChange={(val) => {
            setTypeFilter(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44 text-mineshaft-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 text-mineshaft-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={ownerFilter}
          onValueChange={(val) => {
            setOwnerFilter(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40 text-mineshaft-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OWNER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <UnstableTable containerClassName="mt-4">
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Name</UnstableTableHead>
            <UnstableTableHead>Type</UnstableTableHead>
            <UnstableTableHead>Source</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
            <UnstableTableHead>Risk Score</UnstableTableHead>
            <UnstableTableHead>Owner</UnstableTableHead>
            <UnstableTableHead>Last Active</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {!isPending &&
            identities.map((identity) => (
              <UnstableTableRow
                key={identity.id}
                onClick={() =>
                  navigate({
                    to: "/organizations/$orgId/projects/nhi/$projectId/discovered-identities/$nhiIdentityId",
                    params: {
                      orgId: currentProject.orgId,
                      projectId: currentProject.id,
                      nhiIdentityId: identity.id
                    }
                  })
                }
              >
                <UnstableTableCell>
                  <div>
                    <p className="font-medium text-mineshaft-100">{identity.name}</p>
                    <p className="text-xs text-mineshaft-400">{identity.externalId}</p>
                  </div>
                </UnstableTableCell>
                <UnstableTableCell>
                  <span className="flex items-center gap-2">
                    {getProviderImagePath(identity.provider) && (
                      <img
                        src={getProviderImagePath(identity.provider)!}
                        alt={identity.provider}
                        className="h-4 w-4"
                      />
                    )}
                    <Badge variant="neutral">{formatIdentityType(identity.type)}</Badge>
                  </span>
                </UnstableTableCell>
                <UnstableTableCell>
                  <span className="text-mineshaft-200">{identity.sourceName || "Unknown"}</span>
                </UnstableTableCell>
                <UnstableTableCell>
                  <Badge variant={getStatusBadgeVariant(identity.status)}>
                    {identity.status.charAt(0).toUpperCase() + identity.status.slice(1)}
                  </Badge>
                </UnstableTableCell>
                <UnstableTableCell>
                  <Badge variant={getRiskBadgeVariant(identity.riskScore)}>
                    {identity.riskScore}
                    <span className="text-[10px] opacity-75">
                      {getRiskLabel(identity.riskScore)}
                    </span>
                  </Badge>
                </UnstableTableCell>
                <UnstableTableCell>
                  {identity.ownerEmail ? (
                    <span className="text-mineshaft-200">{identity.ownerEmail}</span>
                  ) : (
                    <span className="text-mineshaft-400">Unassigned</span>
                  )}
                </UnstableTableCell>
                <UnstableTableCell>
                  <span className="text-mineshaft-300">
                    {identity.lastActivityAt
                      ? new Date(identity.lastActivityAt).toLocaleDateString()
                      : "Never"}
                  </span>
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
        </UnstableTableBody>
      </UnstableTable>
      {!isPending && identities.length === 0 && (
        <UnstableEmpty>
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>No identities found</UnstableEmptyTitle>
            <UnstableEmptyDescription>
              Try adjusting your search or filter criteria.
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      )}
      {totalCount > 0 && (
        <UnstablePagination
          count={totalCount}
          page={page}
          perPage={PAGE_SIZE}
          onChangePage={setPage}
          onChangePerPage={() => {}}
        />
      )}

      {totalPages > 0 && (
        <p className="mt-2 text-xs text-mineshaft-400">
          Showing {identities.length} of {totalCount} identities
        </p>
      )}
    </>
  );
};
