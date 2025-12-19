/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useMemo, useState } from "react";
import { faFilter, faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  FilterableSelect,
  IconButton,
  Input,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { useDebounce, usePopUp } from "@app/hooks";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  TListCertificateRequestsParams,
  useListCertificateRequests
} from "@app/hooks/api/certificates";

import { CertificateIssuanceModal } from "../../CertificatesPage/components/CertificateIssuanceModal";
import { CertificateRequestRow } from "./CertificateRequestRow";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_DELAY = 500;

type CertificateRequestStatus = "pending" | "issued" | "failed";

type CertificateRequestFilters = {
  status?: CertificateRequestStatus;
};

type Props = {
  onViewCertificateFromRequest?: (certificateId: string) => void;
};

export const CertificateRequestsSection = ({ onViewCertificateFromRequest }: Props) => {
  const { currentProject } = useProject();

  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingProfileIds, setPendingProfileIds] = useState<string[]>([]);
  const [pendingFilters, setPendingFilters] = useState<CertificateRequestFilters>({});

  const [appliedProfileIds, setAppliedProfileIds] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<CertificateRequestFilters>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["issueCertificate"] as const);

  const [debouncedSearch, setDebouncedSearch] = useDebounce(pendingSearch, SEARCH_DEBOUNCE_DELAY);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const { data: profilesData } = useListCertificateProfiles({
    projectId: currentProject?.id ?? "",
    limit: 100
  });

  const profileIds = useMemo(() => {
    return appliedProfileIds.length > 0 ? appliedProfileIds : undefined;
  }, [appliedProfileIds]);

  const queryParams: TListCertificateRequestsParams = useMemo(
    () => ({
      projectSlug: currentProject?.slug || "",
      offset: (currentPage - 1) * perPage,
      limit: perPage,
      sortBy: "createdAt",
      sortOrder: "desc",
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(appliedFilters.status && { status: appliedFilters.status }),
      ...(profileIds && { profileIds })
    }),
    [currentProject?.slug, currentPage, perPage, debouncedSearch, appliedFilters.status, profileIds]
  );

  const {
    data: certificateRequestsData,
    isLoading,
    isError
  } = useListCertificateRequests(queryParams);

  const handleApplyFilters = () => {
    setAppliedFilters(pendingFilters);
    setAppliedProfileIds(pendingProfileIds);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setPendingSearch("");
    setPendingFilters({});
    setPendingProfileIds([]);
    setAppliedFilters({});
    setAppliedProfileIds([]);
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
    () => Boolean(appliedFilters.status || appliedProfileIds.length),
    [appliedFilters.status, appliedProfileIds.length]
  );

  const hasPendingChanges = useMemo(() => {
    const pendingStatus = pendingFilters.status ?? undefined;
    const appliedStatus = appliedFilters.status ?? undefined;
    const statusChanged = pendingStatus !== appliedStatus;
    const profileIdsChanged =
      JSON.stringify([...pendingProfileIds].sort()) !==
      JSON.stringify([...appliedProfileIds].sort());
    return statusChanged || profileIdsChanged;
  }, [pendingFilters.status, appliedFilters.status, pendingProfileIds, appliedProfileIds]);

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
        <div>
          <div className="flex items-center gap-x-2 whitespace-nowrap">
            <p className="text-xl font-medium text-mineshaft-100">Certificate Requests</p>
          </div>
        </div>
        <div className="flex gap-2">
          <ProjectPermissionCan
            I={ProjectPermissionCertificateProfileActions.IssueCert}
            a={ProjectPermissionSub.CertificateProfiles}
          >
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("issueCertificate")}
                isDisabled={!isAllowed}
              >
                Request
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <Input
          value={pendingSearch}
          onChange={(e) => setPendingSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search by SAN or CN"
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Certificate Requests"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
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

              <div className="pt-2">
                <Button
                  onClick={handleApplyFilters}
                  className="w-full bg-primary font-medium text-black hover:bg-primary-600"
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

      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="text-xs font-medium text-bunker-300 uppercase">SAN / CN</Th>
                <Th className="text-xs font-medium text-bunker-300 uppercase">SERIAL NUMBER</Th>
                <Th className="text-xs font-medium text-bunker-300 uppercase">STATUS</Th>
                <Th className="text-xs font-medium text-bunker-300 uppercase">PROFILE</Th>
                <Th className="text-xs font-medium text-bunker-300 uppercase">CREATED AT</Th>
                <Th className="text-xs font-medium text-bunker-300 uppercase">UPDATED AT</Th>
                <Th className="text-xs font-medium text-bunker-300 uppercase" />
              </Tr>
            </THead>
            <TBody>
              {isLoading && <TableSkeleton columns={7} innerKey="certificate-requests-loading" />}
              {isError && (
                <Tr>
                  <td colSpan={7} className="py-8 text-center text-red-400">
                    Failed to load certificate requests. Please try again.
                  </td>
                </Tr>
              )}
              {!isLoading &&
                !isError &&
                certificateRequestsData?.certificateRequests?.length === 0 && (
                  <Tr>
                    <td colSpan={7} className="py-8 text-center text-bunker-300">
                      {isTableFiltered
                        ? "No certificate requests found matching your filters"
                        : "No certificate requests found"}
                    </td>
                  </Tr>
                )}
              {!isLoading &&
                !isError &&
                certificateRequestsData?.certificateRequests?.map((request) => (
                  <CertificateRequestRow
                    key={request.id}
                    request={request}
                    onViewCertificates={handleViewCertificates}
                  />
                ))}
            </TBody>
          </Table>
        </TableContainer>

        {certificateRequestsData && certificateRequestsData.totalCount > 0 && (
          <div className="flex items-center justify-between">
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
          </div>
        )}
      </div>

      <CertificateIssuanceModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
