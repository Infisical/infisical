/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useMemo, useState } from "react";
import { faFilter, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { FilterableSelect, Select, SelectItem } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
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
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { useDebounce, usePopUp } from "@app/hooks";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  TListCertificateRequestsParams,
  useListCertificateRequests
} from "@app/hooks/api/certificates";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  useGetPkiApplicationPermissions
} from "@app/hooks/api/pkiApplications";

import { CertificateIssuanceModal } from "../../CertificatesPage/components/CertificateIssuanceModal";
import {
  type MetadataFilterEntry,
  MetadataFilterSection
} from "../../components/MetadataFilterSection";
import { CertificateRequestRow } from "./CertificateRequestRow";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_DELAY = 500;

type CertificateRequestStatus = "pending" | "issued" | "failed";

type CertificateRequestFilters = {
  status?: CertificateRequestStatus;
};

type Props = {
  onViewCertificateFromRequest?: (certificateId: string) => void;
  applicationId?: string;
  applicationName?: string;
};

export const CertificateRequestsSection = ({
  onViewCertificateFromRequest,
  applicationId,
  applicationName
}: Props) => {
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingProfileIds, setPendingProfileIds] = useState<string[]>([]);
  const [pendingFilters, setPendingFilters] = useState<CertificateRequestFilters>({});
  const [pendingMetadataFilters, setPendingMetadataFilters] = useState<MetadataFilterEntry[]>([]);

  const [appliedProfileIds, setAppliedProfileIds] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<CertificateRequestFilters>({});
  const [appliedMetadataFilters, setAppliedMetadataFilters] = useState<MetadataFilterEntry[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["issueCertificate"] as const);

  const [debouncedSearch, setDebouncedSearch] = useDebounce(pendingSearch, SEARCH_DEBOUNCE_DELAY);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const { data: profilesData } = useListCertificateProfiles({
    limit: 100,
    applicationId
  });

  const { permission: projectPermission } = useProjectPermission();
  const { data: appPermissionData } = useGetPkiApplicationPermissions(applicationId ?? "");
  const canRequestCertificate = applicationId
    ? Boolean(
        appPermissionData?.permission?.can(
          PkiApplicationResourceActions.Create,
          PkiApplicationResourceSub.Certificates
        )
      )
    : projectPermission.can(
        ProjectPermissionCertificateActions.Create,
        ProjectPermissionSub.Certificates
      );

  const profileIds = useMemo(() => {
    return appliedProfileIds.length > 0 ? appliedProfileIds : undefined;
  }, [appliedProfileIds]);

  const activeMetadataFilters = useMemo(() => {
    const filtered = appliedMetadataFilters
      .filter((m) => m.key.trim())
      .map(({ key, value }) => ({ key, ...(value?.trim() ? { value } : {}) }));
    return filtered.length > 0 ? filtered : undefined;
  }, [appliedMetadataFilters]);

  const queryParams: TListCertificateRequestsParams = useMemo(
    () => ({
      offset: (currentPage - 1) * perPage,
      limit: perPage,
      sortBy: "createdAt",
      sortOrder: "desc",
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(appliedFilters.status && { status: appliedFilters.status }),
      ...(profileIds && { profileIds }),
      ...(applicationId && { applicationId }),
      ...(activeMetadataFilters && { metadataFilter: activeMetadataFilters })
    }),
    [
      currentPage,
      perPage,
      debouncedSearch,
      appliedFilters.status,
      profileIds,
      applicationId,
      activeMetadataFilters
    ]
  );

  const {
    data: certificateRequestsData,
    isLoading,
    isError
  } = useListCertificateRequests(queryParams);

  const handleApplyFilters = () => {
    setAppliedFilters(pendingFilters);
    setAppliedProfileIds(pendingProfileIds);
    setAppliedMetadataFilters(pendingMetadataFilters);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setPendingSearch("");
    setPendingFilters({});
    setPendingProfileIds([]);
    setPendingMetadataFilters([]);
    setAppliedFilters({});
    setAppliedProfileIds([]);
    setAppliedMetadataFilters([]);
    setDebouncedSearch("");
    setCurrentPage(1);
  };

  const handleClearStatus = () => {
    setPendingFilters((prev) => ({ ...prev, status: undefined }));
  };

  const handleClearProfiles = () => {
    setPendingProfileIds([]);
  };

  const handleViewCertificates = (certificateId: string) => {
    onViewCertificateFromRequest?.(certificateId);
  };

  const isTableFiltered = useMemo(
    () =>
      Boolean(
        appliedFilters.status ||
          appliedProfileIds.length ||
          appliedMetadataFilters.some((m) => m.key.trim())
      ),
    [appliedFilters.status, appliedProfileIds.length, appliedMetadataFilters]
  );

  const hasPendingChanges = useMemo(() => {
    const pendingStatus = pendingFilters.status ?? undefined;
    const appliedStatus = appliedFilters.status ?? undefined;
    const statusChanged = pendingStatus !== appliedStatus;
    const profileIdsChanged =
      JSON.stringify([...pendingProfileIds].sort()) !==
      JSON.stringify([...appliedProfileIds].sort());
    const metadataChanged =
      JSON.stringify(pendingMetadataFilters) !== JSON.stringify(appliedMetadataFilters);
    return statusChanged || profileIdsChanged || metadataChanged;
  }, [
    pendingFilters.status,
    appliedFilters.status,
    pendingProfileIds,
    appliedProfileIds,
    pendingMetadataFilters,
    appliedMetadataFilters
  ]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Certificate Requests</CardTitle>
        <CardDescription>
          {applicationId
            ? "Filter, view, and manage certificate requests against this application"
            : "Track certificate issuance requests across Certificate Manager."}
        </CardDescription>
        <CardAction>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  onClick={() => handlePopUpOpen("issueCertificate")}
                  disabled={!canRequestCertificate}
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-1.5 size-3.5" />
                  Request Certificate
                </Button>
              </span>
            </TooltipTrigger>
            {!canRequestCertificate && (
              <TooltipContent side="left">
                You don&apos;t have permission to request certificates here.
              </TooltipContent>
            )}
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder="Search by SAN, CN, or Serial Number"
            />
          </InputGroup>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label="Filter Certificate Requests"
                variant={isTableFiltered ? "project" : "outline"}
                size="md"
                className={twMerge(isTableFiltered && "text-primary")}
              >
                <FontAwesomeIcon icon={faFilter} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              sideOffset={2}
              className="max-h-[70vh] thin-scrollbar w-80 overflow-y-auto p-4"
              align="end"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-mineshaft-100">Filters</h3>
                  <span className="text-xs text-bunker-300">
                    {isTableFiltered && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="cursor-pointer text-primary hover:text-primary-600"
                      >
                        Clear filters
                      </button>
                    )}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-bunker-300 uppercase">
                      Certificate Profiles
                    </span>
                    {pendingProfileIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearProfiles}
                        className="cursor-pointer text-xs text-primary hover:text-primary-600"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <FilterableSelect
                    value={pendingProfileIds.map((id) => ({
                      value: id,
                      label: profilesData?.certificateProfiles?.find((p) => p.id === id)?.slug || id
                    }))}
                    onChange={(selectedOptions) => {
                      const ids = Array.isArray(selectedOptions)
                        ? selectedOptions.map((opt) => opt.value)
                        : [];
                      setPendingProfileIds(ids);
                    }}
                    options={
                      profilesData?.certificateProfiles?.map((profile) => ({
                        value: profile.id,
                        label: profile.slug
                      })) || []
                    }
                    placeholder="Select certificate profiles..."
                    className="w-full border-mineshaft-600 bg-mineshaft-700 text-bunker-200"
                    isMulti
                    isLoading={!profilesData}
                    maxMenuHeight={120}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-bunker-300 uppercase">Events</label>
                    {pendingFilters.status && (
                      <button
                        type="button"
                        onClick={handleClearStatus}
                        className="cursor-pointer text-xs text-primary hover:text-primary-600"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <Select
                    value={pendingFilters.status || "all"}
                    onValueChange={(value: string) => {
                      setPendingFilters((prev) => ({
                        ...prev,
                        status: value === "all" ? undefined : (value as CertificateRequestStatus)
                      }));
                    }}
                    placeholder="All events"
                    className="w-full border-mineshaft-600 bg-mineshaft-700 text-bunker-200"
                    position="popper"
                    dropdownContainerClassName="max-w-none"
                  >
                    <SelectItem value="all">All events</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="issued">Issued</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </Select>
                </div>

                <MetadataFilterSection
                  entries={pendingMetadataFilters}
                  onChange={setPendingMetadataFilters}
                />

                <div className="pt-2">
                  <Button
                    onClick={handleApplyFilters}
                    className="w-full"
                    variant="project"
                    size="sm"
                    isDisabled={!hasPendingChanges}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="max-w-[200px] min-w-[120px]">SAN / CN</TableHead>
              <TableHead className="max-w-[120px] min-w-[90px]">Serial #</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="max-w-[140px] min-w-[80px]">Profile</TableHead>
              <TableHead className="w-[110px]">Created</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`request-skeleton-${i + 1}`}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={`request-skeleton-cell-${j + 1}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && isError && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-red-400">
                  Failed to load certificate requests. Please try again.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              !isError &&
              certificateRequestsData?.certificateRequests?.map((request) => (
                <CertificateRequestRow
                  key={request.id}
                  request={request}
                  onViewCertificates={handleViewCertificates}
                  applicationName={applicationName}
                />
              ))}
          </TableBody>
        </Table>

        {!isLoading && !isError && certificateRequestsData?.certificateRequests?.length === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{isTableFiltered ? "No matches" : "No certificate requests"}</EmptyTitle>
              <EmptyDescription>
                {isTableFiltered
                  ? "No certificate requests match your filters."
                  : "Request a certificate to see it listed here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {certificateRequestsData && certificateRequestsData.totalCount > 0 && (
          <Pagination
            count={certificateRequestsData.totalCount}
            page={currentPage}
            perPage={perPage}
            onChangePage={(page) => setCurrentPage(page)}
            onChangePerPage={(newPerPage) => {
              setCurrentPage(1);
              setPerPage(newPerPage);
            }}
          />
        )}
      </CardContent>

      <CertificateIssuanceModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        applicationId={applicationId}
        applicationName={applicationName}
      />
    </Card>
  );
};
