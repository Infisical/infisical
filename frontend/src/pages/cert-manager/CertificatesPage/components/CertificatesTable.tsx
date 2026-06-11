/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BanIcon,
  BoxIcon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  FileOutputIcon,
  FilterIcon,
  LinkIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  CertificateDisplayName,
  getCertificateDisplayName
} from "@app/components/utilities/certificateDisplayUtils";
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
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
import {
  ProjectPermissionActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import { useUpdateRenewalConfig } from "@app/hooks/api";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import {
  useDeleteCertificateInventoryView,
  useListCertificateInventoryViews,
  useUpdateCertificateInventoryView
} from "@app/hooks/api/certificateInventoryViews";
import type {
  TInventoryViewFilters,
  TSystemViewFilters
} from "@app/hooks/api/certificateInventoryViews/types";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { NON_PQC_KEY_ALGORITHMS, PQC_KEY_ALGORITHMS } from "@app/hooks/api/certificates/constants";
import { CertSource, CertStatus } from "@app/hooks/api/certificates/enums";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { useGetPkiApplicationPermissions } from "@app/hooks/api/pkiApplications/queries";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";
import { useDebounce } from "@app/hooks/useDebounce";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { ActiveFilterChips } from "./ActiveFilterChips";
import { AssignCertificateToApplicationModal } from "./AssignCertificateToApplicationModal";
import {
  getCertSourceLabel,
  getCertValidUntilBadgeDetails,
  isExpiringWithinOneDay
} from "./CertificatesTable.utils";
import { ColumnVisibilityToggle, getDefaultVisibleColumns } from "./ColumnVisibilityToggle";
import { certificatesToCSV, downloadCSV } from "./csvExport";
import { FilterBuilder } from "./FilterBuilder";
import { type FilterRule, filtersToSearchParams } from "./inventory-types";
import { SaveViewModal } from "./SaveViewModal";
import { ViewsDropdown } from "./ViewsDropdown";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      [
        "issueCertificate",
        "deleteCertificate",
        "revokeCertificate",
        "certificateCert",
        "certificateExport",
        "manageRenewal",
        "renewCertificate",
        "managePkiSyncs"
      ]
    >,
    data?: {
      serialNumber?: string;
      commonName?: string;
      certificateId?: string;
      profileId?: string;
      renewBeforeDays?: number;
      ttlDays?: number;
      notAfter?: string;
      renewalError?: string;
      renewedFromCertificateId?: string;
      renewedByCertificateId?: string;
    }
  ) => void;
  externalFilter?: {
    search?: string;
  };
  dashboardFilters?: FilterRule[];
  dashboardViewId?: string;
  applicationId?: string;
  applicationName?: string;
};

const PER_PAGE_INIT = 25;
const VIEW_STORAGE_KEY_BASE = "cert-inventory-active-view";
const getViewStorageKey = (applicationId?: string) =>
  applicationId ? `${VIEW_STORAGE_KEY_BASE}:${applicationId}` : VIEW_STORAGE_KEY_BASE;
const MS_PER_DAY = 86_400_000;
const SEARCH_DEBOUNCE_MS = 500;

const EmptyCell = () => <span className="text-muted">—</span>;

const getEnrollmentMethodBadge = (enrollmentType: string | null | undefined) => {
  if (!enrollmentType) return <EmptyCell />;
  const label = enrollmentType.toUpperCase();
  return <Badge variant="ghost">{label}</Badge>;
};

const SortIcon = ({
  column,
  sortBy: sb,
  sortOrder: so
}: {
  column: string;
  sortBy?: string;
  sortOrder?: string;
}) => {
  if (!sb || sb !== column) return null;
  const Icon = so === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return <Icon className="ml-1 inline-block size-3" />;
};

export const CertificatesTable = ({
  handlePopUpOpen,
  externalFilter,
  dashboardFilters,
  dashboardViewId,
  applicationId,
  applicationName
}: Props) => {
  const isInventoryView = !applicationId;
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);
  const [search, setSearch] = useState(externalFilter?.search || "");
  const [appliedSearch, setAppliedSearch] = useState(externalFilter?.search || "");

  const { data: appPermissionData } = useGetPkiApplicationPermissions(applicationId ?? "");
  const canReadAtApplication = Boolean(
    appPermissionData?.permission?.can(
      PkiApplicationResourceActions.Read,
      PkiApplicationResourceSub.Certificates
    )
  );
  const canEditAtApplication = Boolean(
    appPermissionData?.permission?.can(
      PkiApplicationResourceActions.Edit,
      PkiApplicationResourceSub.Certificates
    )
  );
  const canDeleteAtApplication = Boolean(
    appPermissionData?.permission?.can(
      PkiApplicationResourceActions.Delete,
      PkiApplicationResourceSub.Certificates
    )
  );
  const canEditPkiSyncsAtApplication = Boolean(
    appPermissionData?.permission?.can(
      PkiApplicationResourceActions.Edit,
      PkiApplicationResourceSub.PkiSyncs
    )
  );

  const getFiltersForSystemViewId = (viewId: string | undefined): FilterRule[] => {
    if (viewId === "system-pqc") {
      return [
        { id: "sv-pqc", field: "keyAlgorithm", operator: "in", value: [...PQC_KEY_ALGORITHMS] }
      ];
    }
    if (viewId === "system-non-pqc") {
      return [
        {
          id: "sv-non-pqc",
          field: "keyAlgorithm",
          operator: "in",
          value: [...NON_PQC_KEY_ALGORITHMS]
        }
      ];
    }
    return [];
  };

  const [appliedFilters, setAppliedFilters] = useState<FilterRule[]>(() => {
    if (dashboardFilters?.length) return dashboardFilters;
    return getFiltersForSystemViewId(dashboardViewId);
  });
  const [pendingFilters, setPendingFilters] = useState<FilterRule[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const hasDashboardFilters = Boolean(dashboardFilters?.length);
  const hasSynchronousDashboardView =
    dashboardViewId === "system-pqc" || dashboardViewId === "system-non-pqc";
  const [activeViewId, setActiveViewId] = useState<string | null>(() => {
    if (dashboardViewId) return dashboardViewId;
    if (hasDashboardFilters) return null;
    try {
      return localStorage.getItem(getViewStorageKey(applicationId)) || "system-all";
    } catch {
      return "system-all";
    }
  });
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const [hasRestoredView, setHasRestoredView] = useState(
    hasDashboardFilters || hasSynchronousDashboardView
  );

  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | undefined>(undefined);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setAppliedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [search]);

  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission, hasProjectRole } = useProjectPermission();

  const canReadViews = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.CertificateInventoryViews
  );
  const canCreateViews = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.CertificateInventoryViews
  );
  const canEditViews = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.CertificateInventoryViews
  );
  const canDeleteViews = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.CertificateInventoryViews
  );

  const projectId = currentProject?.id ?? "";
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() =>
    getDefaultVisibleColumns(projectId)
  );
  const [assignTargetId, setAssignTargetId] = useState<string | null>(null);

  const { data: profilesData } = useListCertificateProfiles({
    limit: 100,
    applicationId
  });

  const [applicationFilterSearch, setApplicationFilterSearch] = useState("");
  const [debouncedApplicationFilterSearch] = useDebounce(applicationFilterSearch);
  const { data: applicationOptionsResponse } = useListPkiApplications(
    { search: debouncedApplicationFilterSearch || undefined, limit: 20 },
    { enabled: !applicationId }
  );

  const selectedApplicationIds = useMemo(() => {
    const ids = new Set<string>();
    [...appliedFilters, ...pendingFilters].forEach((rule) => {
      if (rule.field === "applicationId" && Array.isArray(rule.value)) {
        rule.value.forEach((v) => {
          if (typeof v === "string") ids.add(v);
        });
      }
    });
    return Array.from(ids);
  }, [appliedFilters, pendingFilters]);

  const { data: selectedApplicationsResponse } = useListPkiApplications(
    { applicationIds: selectedApplicationIds, limit: 100 },
    { enabled: !applicationId && selectedApplicationIds.length > 0 }
  );

  const applicationOptions = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>();
    (applicationOptionsResponse?.applications ?? []).forEach((app) => {
      byId.set(app.id, { value: app.id, label: app.name });
    });
    (selectedApplicationsResponse?.applications ?? []).forEach((app) => {
      byId.set(app.id, { value: app.id, label: app.name });
    });
    return Array.from(byId.values());
  }, [applicationOptionsResponse, selectedApplicationsResponse]);

  const { data: caData } = useListCasByProjectId();
  const { data: viewsData } = useListCertificateInventoryViews(applicationId);
  const { mutateAsync: deleteView } = useDeleteCertificateInventoryView();
  const { mutateAsync: updateView } = useUpdateCertificateInventoryView();
  const { mutateAsync: updateRenewalConfig } = useUpdateRenewalConfig();
  const { user } = useUser();

  const caCapabilityMap = useMemo(() => {
    if (!caData) return {};
    const map: Record<string, CaType> = {};
    caData.forEach((ca) => {
      map[ca.id] = ca.type;
    });
    return map;
  }, [caData]);

  const dynamicFieldOptions = useMemo(() => {
    const options: Record<string, { value: string; label: string }[]> = {};
    if (caData) {
      options.caId = caData.map((ca) => ({
        value: ca.id,
        label: ca.name || ca.id
      }));
    }
    if (profilesData?.certificateProfiles) {
      options.profileId = profilesData.certificateProfiles.map((p) => ({
        value: p.id,
        label: p.slug
      }));
    }
    if (applicationOptions.length) {
      options.applicationId = applicationOptions;
    }
    return options;
  }, [caData, profilesData, applicationOptions]);

  const filterSearchParams = useMemo(() => filtersToSearchParams(appliedFilters), [appliedFilters]);

  const { data, isPending } = useListWorkspaceCertificates({
    projectId: currentProject?.id ?? "",
    offset: (page - 1) * perPage,
    limit: perPage,
    search: appliedSearch.trim() || undefined,
    status: filterSearchParams.status as string | undefined,
    profileIds: filterSearchParams.profileIds as string[] | undefined,
    keyAlgorithm: filterSearchParams.keyAlgorithm,
    keySizes: filterSearchParams.keySizes,
    caIds: filterSearchParams.caIds,
    enrollmentTypes: filterSearchParams.enrollmentTypes,
    notAfterFrom: filterSearchParams.notAfterFrom
      ? new Date(filterSearchParams.notAfterFrom)
      : undefined,
    notAfterTo: filterSearchParams.notAfterTo ? new Date(filterSearchParams.notAfterTo) : undefined,
    notBeforeFrom: filterSearchParams.notBeforeFrom
      ? new Date(filterSearchParams.notBeforeFrom)
      : undefined,
    notBeforeTo: filterSearchParams.notBeforeTo
      ? new Date(filterSearchParams.notBeforeTo)
      : undefined,
    source: filterSearchParams.source,
    metadataFilter: filterSearchParams.metadata,
    applicationId,
    applicationIds: filterSearchParams.applicationIds,
    sortBy,
    sortOrder
  });

  const certificates = data?.certificates || [];

  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder("asc");
      }
      setPage(1);
    },
    [sortBy]
  );

  const handleDisableAutoRenewal = async (certificateId: string, commonName: string) => {
    if (!currentProject?.slug) {
      createNotification({
        text: "Unable to disable auto-renewal: Project not found.",
        type: "error"
      });
      return;
    }
    try {
      await updateRenewalConfig({
        certificateId,
        enableAutoRenewal: false
      });
      createNotification({
        text: `Auto-renewal disabled for ${commonName}`,
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to disable auto-renewal",
        type: "error"
      });
    }
  };

  const persistViewId = (viewId: string | null) => {
    try {
      const storageKey = getViewStorageKey(applicationId);
      if (viewId) {
        localStorage.setItem(storageKey, viewId);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // localStorage may be unavailable
    }
  };

  const handleApplyFilters = () => {
    setAppliedFilters(pendingFilters);
    setActiveViewId(null);
    persistViewId(null);
    setPage(1);
    setIsFilterOpen(false);
  };

  const handleRemoveFilter = (ruleId: string) => {
    const next = appliedFilters.filter((r) => r.id !== ruleId);
    setAppliedFilters(next);
    setPendingFilters(next);
    setActiveViewId(null);
    persistViewId(null);
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setAppliedFilters([]);
    setPendingFilters([]);
    setActiveViewId("system-all");
    persistViewId("system-all");
    setPage(1);
  };

  const handleSelectView = useCallback(
    (viewId: string, filters: TInventoryViewFilters | TSystemViewFilters) => {
      setActiveViewId(viewId);
      persistViewId(viewId);
      setAppliedFilters([]);
      setPendingFilters([]);
      setPage(1);

      if (viewId === "system-all") {
        // do nothing
      } else if (viewId === "system-expiring-7d") {
        const now = new Date();
        const in7d = new Date(now.getTime() + 7 * MS_PER_DAY);
        setAppliedFilters([
          { id: "sv-status", field: "status", operator: "in", value: ["active"] },
          {
            id: "sv-expiry",
            field: "notAfter",
            operator: "before",
            value: in7d.toISOString().split("T")[0]
          }
        ]);
      } else if (viewId === "system-expiring-30d") {
        const now = new Date();
        const in30d = new Date(now.getTime() + 30 * MS_PER_DAY);
        setAppliedFilters([
          { id: "sv-status", field: "status", operator: "in", value: ["active"] },
          {
            id: "sv-expiry",
            field: "notAfter",
            operator: "before",
            value: in30d.toISOString().split("T")[0]
          }
        ]);
      } else if (viewId === "system-expired") {
        setAppliedFilters([
          { id: "sv-status", field: "status", operator: "in", value: ["expired"] }
        ]);
      } else if (viewId === "system-revoked") {
        setAppliedFilters([
          { id: "sv-status", field: "status", operator: "in", value: ["revoked"] }
        ]);
      } else if (viewId === "system-pqc") {
        setAppliedFilters([
          {
            id: "sv-pqc",
            field: "keyAlgorithm",
            operator: "in",
            value: [...PQC_KEY_ALGORITHMS]
          }
        ]);
      } else if (viewId === "system-non-pqc") {
        setAppliedFilters([
          {
            id: "sv-non-pqc",
            field: "keyAlgorithm",
            operator: "in",
            value: [...NON_PQC_KEY_ALGORITHMS]
          }
        ]);
      } else {
        const customFilters = filters as TInventoryViewFilters;
        const rules: FilterRule[] = [];
        if (customFilters.status) {
          const statusArr = customFilters.status.split(",");
          if (statusArr.length > 0) {
            rules.push({ id: "cv-status", field: "status", operator: "in", value: statusArr });
          }
        }
        if (customFilters.notAfterTo) {
          const d = new Date(customFilters.notAfterTo);
          rules.push({
            id: "cv-notAfterTo",
            field: "notAfter",
            operator: "before",
            value: d.toISOString().split("T")[0]
          });
        }
        if (customFilters.notAfterFrom) {
          const d = new Date(customFilters.notAfterFrom);
          rules.push({
            id: "cv-notAfterFrom",
            field: "notAfter",
            operator: "after",
            value: d.toISOString().split("T")[0]
          });
        }
        if (customFilters.notBeforeTo) {
          const d = new Date(customFilters.notBeforeTo);
          rules.push({
            id: "cv-notBeforeTo",
            field: "notBefore",
            operator: "before",
            value: d.toISOString().split("T")[0]
          });
        }
        if (customFilters.notBeforeFrom) {
          const d = new Date(customFilters.notBeforeFrom);
          rules.push({
            id: "cv-notBeforeFrom",
            field: "notBefore",
            operator: "after",
            value: d.toISOString().split("T")[0]
          });
        }
        if (customFilters.enrollmentTypes && customFilters.enrollmentTypes.length > 0) {
          rules.push({
            id: "cv-enrollment",
            field: "enrollmentType",
            operator: "in",
            value: customFilters.enrollmentTypes
          });
        }
        if (customFilters.keyAlgorithm) {
          const algoValue = Array.isArray(customFilters.keyAlgorithm)
            ? customFilters.keyAlgorithm
            : [customFilters.keyAlgorithm];
          rules.push({
            id: "cv-algo",
            field: "keyAlgorithm",
            operator: "in",
            value: algoValue
          });
        }
        if (customFilters.keySizes && customFilters.keySizes.length > 0) {
          rules.push({
            id: "cv-keysize",
            field: "keySize",
            operator: "in",
            value: customFilters.keySizes.map(String)
          });
        }
        if (customFilters.caIds && customFilters.caIds.length > 0) {
          rules.push({ id: "cv-ca", field: "caId", operator: "in", value: customFilters.caIds });
        }
        if (customFilters.profileIds && customFilters.profileIds.length > 0) {
          rules.push({
            id: "cv-profile",
            field: "profileId",
            operator: "in",
            value: customFilters.profileIds
          });
        }
        if (customFilters.applicationIds && customFilters.applicationIds.length > 0) {
          rules.push({
            id: "cv-application",
            field: "applicationId",
            operator: "in",
            value: customFilters.applicationIds
          });
        }
        if (customFilters.source) {
          const sourceValue = Array.isArray(customFilters.source)
            ? customFilters.source
            : [customFilters.source];
          rules.push({
            id: "cv-source",
            field: "source",
            operator: "in",
            value: sourceValue
          });
        }
        if (customFilters.metadata && customFilters.metadata.length > 0) {
          customFilters.metadata.forEach((m, i) => {
            rules.push({
              id: `cv-meta-${i}`,
              field: "metadata",
              operator: "is",
              value: [m.key, m.value ?? ""]
            });
          });
        }
        setAppliedFilters(rules);
      }
    },
    []
  );

  const handleDeleteView = async (viewId: string) => {
    if (!currentProject?.id) return;
    try {
      await deleteView({ viewId });
      createNotification({ text: "View deleted", type: "success" });
      if (activeViewId === viewId) {
        handleClearAllFilters();
      }
    } catch {
      createNotification({ text: "Failed to delete view", type: "error" });
    }
  };

  const handleToggleShare = async (viewId: string, isShared: boolean) => {
    if (!currentProject?.id) return;
    try {
      await updateView({ viewId, isShared });
      createNotification({
        text: isShared ? "View shared with team" : "View made personal",
        type: "success"
      });
    } catch {
      createNotification({ text: "Failed to update view sharing", type: "error" });
    }
  };

  useEffect(() => {
    if (hasRestoredView || !viewsData) return;
    setHasRestoredView(true);

    if (!activeViewId || activeViewId === "system-all") return;

    const systemView = viewsData.systemViews.find((v) => v.id === activeViewId);
    if (systemView) {
      handleSelectView(systemView.id, systemView.filters);
      return;
    }

    const sharedView = viewsData.sharedViews?.find((v) => v.id === activeViewId);
    if (sharedView) {
      handleSelectView(sharedView.id, sharedView.filters);
      return;
    }

    const customView = viewsData.customViews.find((v) => v.id === activeViewId);
    if (customView) {
      handleSelectView(customView.id, customView.filters);
      return;
    }

    setActiveViewId("system-all");
    persistViewId("system-all");
  }, [viewsData, hasRestoredView, handleSelectView]);

  const handleExportCSV = () => {
    if (!certificates.length) return;
    const csv = certificatesToCSV(certificates);
    downloadCSV(csv, `certificates-export-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const isTableFiltered = appliedFilters.length > 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SAN, CN, ID or Serial Number"
          />
        </InputGroup>

        <Popover
          open={isFilterOpen}
          onOpenChange={(open) => {
            if (open) setPendingFilters([...appliedFilters]);
            setIsFilterOpen(open);
          }}
        >
          <PopoverTrigger asChild>
            <div className="relative">
              <IconButton
                variant={isTableFiltered ? "project" : "outline"}
                size="md"
                aria-label="Filter Certificates"
              >
                <FilterIcon />
              </IconButton>
              {isTableFiltered && (
                <Badge
                  variant="default"
                  className="pointer-events-none absolute -top-2 -right-2.5 min-w-[18px] justify-center px-1 py-0 text-[10px] font-bold"
                >
                  {appliedFilters.length}
                </Badge>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} className="w-[680px] overflow-visible p-0" align="end">
            <FilterBuilder
              rules={pendingFilters}
              onChange={setPendingFilters}
              onApply={handleApplyFilters}
              onCancel={() => {
                setPendingFilters(appliedFilters);
                setIsFilterOpen(false);
              }}
              onClearAll={() => {
                handleClearAllFilters();
                setIsFilterOpen(false);
              }}
              onSaveView={canCreateViews ? () => setIsSaveViewOpen(true) : undefined}
              dynamicFieldOptions={dynamicFieldOptions}
              onDynamicFieldSearch={{ applicationId: setApplicationFilterSearch }}
              hiddenFieldKeys={applicationId ? ["applicationId"] : undefined}
            />
          </PopoverContent>
        </Popover>

        <IconButton
          variant="outline"
          size="md"
          aria-label="Export CSV"
          onClick={handleExportCSV}
          disabled={!certificates.length}
        >
          <DownloadIcon />
        </IconButton>

        {canReadViews && (
          <ViewsDropdown
            activeViewId={activeViewId}
            systemViews={viewsData?.systemViews || []}
            sharedViews={viewsData?.sharedViews || []}
            customViews={viewsData?.customViews || []}
            currentUserId={user?.id}
            onSelectView={handleSelectView}
            onDeleteView={canDeleteViews ? (viewId) => handleDeleteView(viewId) : undefined}
            onToggleShare={canEditViews ? handleToggleShare : undefined}
          />
        )}

        <ColumnVisibilityToggle
          visibleColumns={visibleColumns}
          onChange={setVisibleColumns}
          projectId={projectId}
        />
      </div>

      <ActiveFilterChips
        rules={appliedFilters}
        onRemove={handleRemoveFilter}
        onClearAll={handleClearAllFilters}
        dynamicFieldOptions={dynamicFieldOptions}
      />

      {(isPending || certificates.length > 0) && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.has("sanCn") && (
                  <TableHead className="max-w-[200px] min-w-[120px]">SAN / CN</TableHead>
                )}
                {visibleColumns.has("serialNumber") && (
                  <TableHead className="max-w-[120px] min-w-[90px]">Serial #</TableHead>
                )}
                {visibleColumns.has("enrollmentMethod") && (
                  <TableHead className="w-[110px]">Enrollment Method</TableHead>
                )}
                {visibleColumns.has("status") && <TableHead className="w-[80px]">Status</TableHead>}
                {visibleColumns.has("health") && (
                  <TableHead className="w-[110px]">Health</TableHead>
                )}
                {visibleColumns.has("issuedAt") && (
                  <TableHead
                    className="w-[100px] cursor-pointer"
                    onClick={() => handleSort("notBefore")}
                  >
                    Issued
                    <SortIcon column="notBefore" sortBy={sortBy} sortOrder={sortOrder} />
                  </TableHead>
                )}
                {visibleColumns.has("expiresAt") && (
                  <TableHead
                    className="w-[100px] cursor-pointer"
                    onClick={() => handleSort("notAfter")}
                  >
                    Expires
                    <SortIcon column="notAfter" sortBy={sortBy} sortOrder={sortOrder} />
                  </TableHead>
                )}
                {visibleColumns.has("ca") && (
                  <TableHead className="max-w-[130px] min-w-[80px]">CA</TableHead>
                )}
                {visibleColumns.has("profile") && (
                  <TableHead className="max-w-[120px] min-w-[80px]">Profile</TableHead>
                )}
                {visibleColumns.has("application") && (
                  <TableHead className="max-w-[140px] min-w-[80px]">Application</TableHead>
                )}
                {visibleColumns.has("algorithm") && (
                  <TableHead className="w-[90px]">Algorithm</TableHead>
                )}
                {visibleColumns.has("source") && <TableHead className="w-[80px]">Source</TableHead>}
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
                    {Array.from({ length: visibleColumns.size + 1 }).map((__, j) => (
                      <TableCell key={`skeleton-cell-${j + 1}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isPending &&
                certificates.map((certificate) => {
                  const { variant, label } = getCertValidUntilBadgeDetails(certificate.notAfter);
                  const isRevoked = certificate.status === CertStatus.REVOKED;
                  const isExpired = new Date(certificate.notAfter) < new Date();
                  const isExpiringWithinDay = isExpiringWithinOneDay(certificate.notAfter);
                  const hasFailed = Boolean(certificate.renewalError);
                  const isAutoRenewalEnabled = Boolean(
                    certificate.renewBeforeDays && certificate.renewBeforeDays > 0
                  );

                  const certSubject = subject(ProjectPermissionSub.Certificates, {
                    commonName: certificate.commonName,
                    altNames: certificate.altNames?.split(",").map((s) => s.trim()),
                    serialNumber: certificate.serialNumber,
                    friendlyName: certificate.friendlyName,
                    metadata: certificate.metadata
                  });
                  const canReadCertificate =
                    permission.can(ProjectPermissionCertificateActions.Read, certSubject) ||
                    canReadAtApplication;
                  const canEditCertificate =
                    permission.can(ProjectPermissionCertificateActions.Edit, certSubject) ||
                    canEditAtApplication;
                  const canDeleteCertificate =
                    permission.can(ProjectPermissionCertificateActions.Delete, certSubject) ||
                    canDeleteAtApplication;
                  const canEditPkiSyncs =
                    permission.can(
                      ProjectPermissionPkiSyncActions.Edit,
                      ProjectPermissionSub.PkiSyncs
                    ) || canEditPkiSyncsAtApplication;
                  const canShowAutoRenewalIcon = Boolean(
                    !isInventoryView &&
                      certificate.profileId &&
                      certificate.hasPrivateKey !== false &&
                      !certificate.renewedByCertificateId &&
                      !isRevoked &&
                      !isExpired &&
                      !isExpiringWithinDay
                  );
                  const { originalDisplayName } = getCertificateDisplayName(certificate, 64, "—");

                  return (
                    <TableRow
                      className="group"
                      key={`certificate-${certificate.id}`}
                      onClick={() => {
                        navigate({
                          to: "/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId",
                          params: {
                            orgId: currentOrg.id,
                            projectId: currentProject.id,
                            certificateId: certificate.id
                          },
                          search: applicationName ? { fromApplication: applicationName } : undefined
                        });
                      }}
                    >
                      {visibleColumns.has("sanCn") && (
                        <TableCell isTruncatable>
                          <CertificateDisplayName cert={certificate} maxLength={64} fallback="—" />
                        </TableCell>
                      )}
                      {visibleColumns.has("serialNumber") && (
                        <TableCell isTruncatable>
                          {truncateSerialNumber(certificate.serialNumber)}
                        </TableCell>
                      )}
                      {visibleColumns.has("enrollmentMethod") && (
                        <TableCell>
                          {getEnrollmentMethodBadge(certificate.enrollmentType)}
                        </TableCell>
                      )}
                      {visibleColumns.has("status") && (
                        <TableCell>
                          {isRevoked ? (
                            <Badge variant="danger">Revoked</Badge>
                          ) : isExpired ? (
                            <Badge variant="danger">Expired</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.has("health") && (
                        <TableCell>
                          {isRevoked ? (
                            <Badge variant="danger">Critical</Badge>
                          ) : (
                            <Badge variant={variant}>{label}</Badge>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.has("issuedAt") && (
                        <TableCell>
                          {certificate.notBefore ? (
                            format(new Date(certificate.notBefore), "yyyy-MM-dd")
                          ) : (
                            <EmptyCell />
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.has("expiresAt") && (
                        <TableCell>
                          {certificate.notAfter ? (
                            format(new Date(certificate.notAfter), "yyyy-MM-dd")
                          ) : (
                            <EmptyCell />
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.has("ca") && (
                        <TableCell isTruncatable>{certificate.caName || <EmptyCell />}</TableCell>
                      )}
                      {visibleColumns.has("profile") && (
                        <TableCell isTruncatable>
                          {certificate.profileName || <EmptyCell />}
                        </TableCell>
                      )}
                      {visibleColumns.has("application") && (
                        <TableCell isTruncatable>
                          {certificate.applicationName || <EmptyCell />}
                        </TableCell>
                      )}
                      {visibleColumns.has("algorithm") && (
                        <TableCell>
                          <span className="text-xs">
                            {certificate.keyAlgorithm?.replace("_", "-") || <EmptyCell />}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.has("source") && (
                        <TableCell>
                          <Badge variant="ghost">
                            {getCertSourceLabel(certificate.source ?? null)}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className={`transition-opacity ${(() => {
                              if (!canShowAutoRenewalIcon) return "";
                              if (isAutoRenewalEnabled) return "opacity-100";
                              return "opacity-0 group-hover:opacity-100";
                            })()}`}
                          >
                            {canShowAutoRenewalIcon &&
                              (() => {
                                const tooltipText = (() => {
                                  if (hasFailed && certificate.renewalError) {
                                    return `Auto-renewal failed: ${certificate.renewalError}`;
                                  }
                                  if (isAutoRenewalEnabled) {
                                    const daysUntilExpiry = Math.ceil(
                                      (new Date(certificate.notAfter).getTime() -
                                        new Date().getTime()) /
                                        MS_PER_DAY
                                    );
                                    const daysUntilRenewal = Math.max(
                                      0,
                                      daysUntilExpiry - (certificate.renewBeforeDays || 0)
                                    );
                                    return `Auto-renews in ${daysUntilRenewal}d`;
                                  }
                                  return "Set auto renewal";
                                })();

                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="cursor-pointer"
                                        aria-label="Certificate auto-renewal"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!canEditCertificate) return;
                                          if (hasFailed) return;

                                          handlePopUpOpen("manageRenewal", {
                                            certificateId: certificate.id,
                                            commonName: originalDisplayName,
                                            profileId: certificate.profileId || "",
                                            renewBeforeDays: certificate.renewBeforeDays || 7,
                                            ttlDays: Math.ceil(
                                              (new Date(certificate.notAfter).getTime() -
                                                new Date(certificate.notBefore).getTime()) /
                                                MS_PER_DAY
                                            ),
                                            notAfter: certificate.notAfter,
                                            renewalError: certificate.renewalError,
                                            renewedFromCertificateId:
                                              certificate.renewedFromCertificateId,
                                            renewedByCertificateId:
                                              certificate.renewedByCertificateId
                                          });
                                        }}
                                      >
                                        <Badge variant={hasFailed ? "danger" : "info"} isSquare>
                                          <ClockIcon className="size-3" />
                                        </Badge>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>{tooltipText}</TooltipContent>
                                  </Tooltip>
                                );
                              })()}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={2}>
                              <DropdownMenuItem
                                isDisabled={!canReadCertificate}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("certificateExport", {
                                    certificateId: certificate.id,
                                    serialNumber: certificate.serialNumber
                                  });
                                }}
                              >
                                <FileOutputIcon />
                                Export Certificate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                isDisabled={!canReadCertificate}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("certificateCert", {
                                    serialNumber: certificate.serialNumber
                                  });
                                }}
                              >
                                <EyeIcon />
                                View Details
                              </DropdownMenuItem>
                              {(() => {
                                const canManageRenewal =
                                  !isInventoryView &&
                                  certificate.profileId &&
                                  certificate.hasPrivateKey !== false &&
                                  !certificate.renewedByCertificateId &&
                                  !isRevoked &&
                                  !isExpired &&
                                  !hasFailed &&
                                  !isExpiringWithinDay;

                                if (!canManageRenewal) return null;

                                return (
                                  <DropdownMenuItem
                                    isDisabled={!canEditCertificate}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const notAfterDate = new Date(certificate.notAfter);
                                      const notBeforeDate = certificate.notBefore
                                        ? new Date(certificate.notBefore)
                                        : new Date(notAfterDate.getTime() - 365 * MS_PER_DAY);
                                      const ttlDays = Math.max(
                                        1,
                                        Math.ceil(
                                          (notAfterDate.getTime() - notBeforeDate.getTime()) /
                                            MS_PER_DAY
                                        )
                                      );
                                      handlePopUpOpen("manageRenewal", {
                                        certificateId: certificate.id,
                                        commonName: certificate.commonName,
                                        profileId: certificate.profileId,
                                        renewBeforeDays: certificate.renewBeforeDays,
                                        ttlDays,
                                        notAfter: certificate.notAfter,
                                        renewalError: certificate.renewalError,
                                        renewedFromCertificateId:
                                          certificate.renewedFromCertificateId,
                                        renewedByCertificateId: certificate.renewedByCertificateId
                                      });
                                    }}
                                  >
                                    <RefreshCwIcon />
                                    {isAutoRenewalEnabled
                                      ? "Manage auto renewal"
                                      : "Enable auto renewal"}
                                  </DropdownMenuItem>
                                );
                              })()}
                              {(() => {
                                const canDisableRenewal =
                                  !isInventoryView &&
                                  certificate.profileId &&
                                  certificate.hasPrivateKey !== false &&
                                  !certificate.renewedByCertificateId &&
                                  !isRevoked &&
                                  !isExpired &&
                                  !isExpiringWithinDay &&
                                  isAutoRenewalEnabled;

                                if (!canDisableRenewal) return null;

                                return (
                                  <DropdownMenuItem
                                    isDisabled={!canEditCertificate}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleDisableAutoRenewal(
                                        certificate.id,
                                        certificate.commonName
                                      );
                                    }}
                                  >
                                    <BanIcon />
                                    Disable auto renewal
                                  </DropdownMenuItem>
                                );
                              })()}
                              {(() => {
                                const canRenew =
                                  !isInventoryView &&
                                  (certificate.profileId || certificate.caId) &&
                                  certificate.hasPrivateKey !== false &&
                                  !certificate.renewedByCertificateId &&
                                  !isRevoked &&
                                  !isExpired;

                                if (!canRenew) return null;

                                return (
                                  <DropdownMenuItem
                                    isDisabled={!canEditCertificate}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("renewCertificate", {
                                        certificateId: certificate.id,
                                        commonName: certificate.commonName
                                      });
                                    }}
                                  >
                                    <RefreshCwIcon />
                                    Renew Now
                                  </DropdownMenuItem>
                                );
                              })()}
                              {!isInventoryView &&
                                certificate.status === CertStatus.ACTIVE &&
                                !certificate.renewedByCertificateId &&
                                certificate.source !== CertSource.Discovered && (
                                  <DropdownMenuItem
                                    isDisabled={!canEditPkiSyncs}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("managePkiSyncs", {
                                        certificateId: certificate.id,
                                        commonName: certificate.commonName
                                      });
                                    }}
                                  >
                                    <LinkIcon />
                                    Manage PKI Syncs
                                  </DropdownMenuItem>
                                )}
                              {hasProjectRole("admin") &&
                                !certificate.applicationId &&
                                certificate.source !== CertSource.Discovered && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAssignTargetId(certificate.id);
                                    }}
                                  >
                                    <BoxIcon />
                                    Assign to Application
                                  </DropdownMenuItem>
                                )}
                              {(() => {
                                const caType = caCapabilityMap[certificate.caId];
                                const supportsRevocation =
                                  !caType ||
                                  caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES);

                                if (
                                  !supportsRevocation ||
                                  isRevoked ||
                                  certificate.source === CertSource.Discovered ||
                                  (isInventoryView && certificate.applicationId)
                                ) {
                                  return null;
                                }

                                return (
                                  <DropdownMenuItem
                                    variant="danger"
                                    isDisabled={!canDeleteCertificate}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("revokeCertificate", {
                                        certificateId: certificate.id
                                      });
                                    }}
                                  >
                                    <BanIcon />
                                    Revoke Certificate
                                  </DropdownMenuItem>
                                );
                              })()}
                              {!(isInventoryView && certificate.applicationId) && (
                                <DropdownMenuItem
                                  variant="danger"
                                  isDisabled={!canDeleteCertificate}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("deleteCertificate", {
                                      certificateId: certificate.id,
                                      commonName: certificate.commonName
                                    });
                                  }}
                                >
                                  <Trash2Icon />
                                  Delete Certificate
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          {!isPending && (data?.totalCount || 0) >= PER_PAGE_INIT && (
            <Pagination
              count={data?.totalCount || 0}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
            />
          )}
        </>
      )}
      {!isPending && !certificates.length && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {isTableFiltered || appliedSearch ? "No matches" : "No certificates"}
            </EmptyTitle>
            <EmptyDescription>
              {isTableFiltered || appliedSearch
                ? "No certificates match your search or filters."
                : "Issue or import a certificate to see it listed here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <SaveViewModal
        isOpen={isSaveViewOpen}
        onOpenChange={setIsSaveViewOpen}
        filters={pendingFilters.length > 0 ? pendingFilters : appliedFilters}
        onViewCreated={(viewId, viewFilters) => {
          handleSelectView(viewId, viewFilters);
        }}
        applicationId={applicationId}
      />

      {assignTargetId ? (
        <AssignCertificateToApplicationModal
          isOpen={Boolean(assignTargetId)}
          onClose={() => setAssignTargetId(null)}
          certificateId={assignTargetId}
        />
      ) : null}
    </div>
  );
};
