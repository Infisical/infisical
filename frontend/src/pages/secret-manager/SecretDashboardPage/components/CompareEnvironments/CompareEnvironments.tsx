import { useCallback, useEffect, useRef, useState } from "react";
import { MultiValue } from "react-select";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faFilter,
  faFingerprint,
  faFolder,
  faKey,
  faRotate,
  faSearch,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  FilterableSelect,
  FormLabel,
  IconButton,
  Input,
  Lottie,
  Pagination,
  Table,
  TableContainer,
  TBody,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, useResetPageHelper } from "@app/hooks";
import { useGetImportedSecretsAllEnvs } from "@app/hooks/api";
import { useGetProjectSecretsOverview } from "@app/hooks/api/dashboard";
import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { WorkspaceEnv } from "@app/hooks/api/workspace/types";
import { useResizableColWidth } from "@app/hooks/useResizableColWidth";
import {
  useDynamicSecretOverview,
  useFolderOverview,
  useSecretOverview,
  useSecretRotationOverview
} from "@app/hooks/utils";
import { SecretTableResourceCount } from "@app/pages/secret-manager/OverviewPage/components/SecretTableResourceCount";

import { DynamicSecretRow } from "./components/DynamicSecretRow";
import { FolderRow } from "./components/FolderRow";
import { SecretRotationRow } from "./components/SecretRotationRow";
import { SecretNoAccessRow, SecretRow } from "./components/SecretRow";

type Props = {
  secretPath: string;
};

enum RowType {
  Folder = "folder",
  DynamicSecret = "dynamic",
  Secret = "secret",
  SecretRotation = "rotation"
}

type Filter = {
  [key in RowType]: boolean;
};

const DEFAULT_FILTER_STATE = {
  [RowType.Folder]: false,
  [RowType.DynamicSecret]: false,
  [RowType.Secret]: false,
  [RowType.SecretRotation]: false
};

const COL_WIDTH_OFFSET = 220;

export const CompareEnvironments = ({ secretPath }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const compareEnvironmentsKey = `compare-environments-${currentWorkspace.id}`;

  const [selectedEnvironments, setSelectedEnvironments] = useState<WorkspaceEnv[]>(() => {
    try {
      const storedEnvironments = JSON.parse(localStorage.getItem(compareEnvironmentsKey) ?? "[]");

      if (Array.isArray(storedEnvironments) && storedEnvironments.length > 0) {
        const potentialEnvs: string[] = [];
        storedEnvironments.forEach((env) => {
          if (typeof env === "string") {
            potentialEnvs.push(env);
          }
        });

        return currentWorkspace.environments.filter((env) => potentialEnvs.includes(env.id));
      }
    } catch {
      // do nothing and proceed
    }
    return currentWorkspace.environments.slice(0, 2);
  });

  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER_STATE);

  const {
    offset,
    limit,
    orderDirection,
    setOrderDirection,
    setPage,
    perPage,
    page,
    setPerPage,
    orderBy
  } = usePagination<DashboardSecretsOrderBy>(DashboardSecretsOrderBy.Name, {
    initPerPage: getUserTablePreference("secretCompareTable", PreferenceKey.PerPage, 50)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("secretCompareTable", PreferenceKey.PerPage, newPerPage);
  };

  const workspaceId = currentWorkspace.id;
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearchFilter] = useDebounce(searchFilter);
  const [debouncedSelectedEnvironments] = useDebounce(selectedEnvironments);

  useEffect(() => {
    localStorage.setItem(
      compareEnvironmentsKey,
      JSON.stringify(selectedEnvironments.map((env) => env.id))
    );
  }, [debouncedSelectedEnvironments]);

  const {
    secretImports,
    isImportedSecretPresentInEnv,
    getImportedSecretByKey,
    getEnvImportedSecretKeyCount
  } = useGetImportedSecretsAllEnvs({
    projectId: workspaceId,
    path: secretPath,
    environments: (currentWorkspace.environments || []).map(({ slug }) => slug)
  });

  const compareEnvironments = selectedEnvironments.length
    ? selectedEnvironments
    : currentWorkspace.environments;

  const isFilteredByResources = Object.values(filter).some(Boolean);
  const { isPending: isOverviewLoading, data: overview } = useGetProjectSecretsOverview(
    {
      projectId: workspaceId,
      environments: compareEnvironments.map((env) => env.slug),
      secretPath,
      orderDirection,
      orderBy,
      includeFolders: isFilteredByResources ? filter.folder : true,
      includeDynamicSecrets: isFilteredByResources ? filter.dynamic : true,
      includeSecrets: isFilteredByResources ? filter.secret : true,
      includeImports: true,
      includeSecretRotations: isFilteredByResources ? filter.rotation : true,
      search: debouncedSearchFilter,
      limit,
      offset
    },
    { enabled: Boolean(compareEnvironments.length) }
  );

  const {
    secrets,
    folders,
    dynamicSecrets,
    secretRotations,
    totalFolderCount,
    totalSecretCount,
    totalDynamicSecretCount,
    totalSecretRotationCount,
    totalCount = 0,
    totalUniqueFoldersInPage,
    totalUniqueSecretsInPage,
    totalUniqueSecretImportsInPage,
    totalUniqueDynamicSecretsInPage,
    totalUniqueSecretRotationsInPage
  } = overview ?? {};

  const secretImportsShaped = secretImports
    ?.flatMap(({ data }) => data)
    .filter(Boolean)
    .flatMap((item) => item?.secrets || []);

  const handleIsImportedSecretPresentInEnv = (envSlug: string, secretName: string) => {
    if (secrets?.some((s) => s.key === secretName && s.env === envSlug)) {
      return false;
    }
    if (secretImportsShaped.some((s) => s.key === secretName && s.sourceEnv === envSlug)) {
      return true;
    }
    return isImportedSecretPresentInEnv(envSlug, secretName);
  };

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { folderNamesAndDescriptions, isFolderPresentInEnv } = useFolderOverview(folders);

  const { dynamicSecretNames, isDynamicSecretPresentInEnv } =
    useDynamicSecretOverview(dynamicSecrets);

  const { secretRotationNames, isSecretRotationPresentInEnv, getSecretRotationByName } =
    useSecretRotationOverview(secretRotations);

  const { secKeys, getEnvSecretKeyCount } = useSecretOverview(
    secrets?.concat(secretImportsShaped) || []
  );

  const getSecretByKey = useCallback(
    (env: string, key: string) => {
      const sec = secrets?.find((s) => s.env === env && s.key === key);
      return sec;
    },
    [secrets]
  );

  const [tableWidth, setTableWidth] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);

  const { handleMouseDown, isResizing, colWidth } = useResizableColWidth({
    initialWidth: 320,
    minWidth: 160,
    maxWidth: tableRef.current
      ? tableRef.current.clientWidth - COL_WIDTH_OFFSET // ensure value column can't collapse completely
      : 800,
    ref: tableRef
  });

  const handleToggleRowType = useCallback(
    (rowType: RowType) =>
      setFilter((state) => {
        return {
          ...state,
          [rowType]: !state[rowType]
        };
      }),
    []
  );

  const isTableEmpty = totalCount === 0;

  const isTableFiltered = isFilteredByResources;

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;

    const handleResize = () => {
      setTableWidth(element.clientWidth - 1);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(element);

    // eslint-disable-next-line consistent-return
    return () => {
      resizeObserver.disconnect();
    };
  }, [tableRef]);

  return (
    // scott: this is reverse to fix z-indexing bug of dropdown with sticky table cols; couldn't resolve with flex-col
    <div className="flex flex-1 flex-col-reverse overflow-hidden">
      {!isOverviewLoading && totalCount > 0 && (
        <Pagination
          startAdornment={
            <SecretTableResourceCount
              dynamicSecretCount={totalDynamicSecretCount}
              secretCount={totalSecretCount}
              folderCount={totalFolderCount}
              secretRotationCount={totalSecretRotationCount}
            />
          }
          className="rounded-b-lg border border-solid border-mineshaft-500 bg-mineshaft-700"
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={(newPage) => setPage(newPage)}
          onChangePerPage={handlePerPageChange}
        />
      )}
      <div className="thin-scrollbar flex flex-1 flex-col overflow-y-auto">
        <TableContainer
          ref={tableRef}
          className={twMerge(
            "mt-4 flex flex-1 flex-col border-mineshaft-500 bg-mineshaft-700",
            !isTableEmpty && "rounded-b-none"
          )}
        >
          {/* eslint-disable-next-line no-nested-ternary */}
          {isOverviewLoading ? (
            <div className="flex h-full flex-col items-center justify-center">
              <Lottie
                isAutoPlay
                icon="infisical_loading"
                className="h-10 place-self-center self-center"
              />
            </div>
          ) : isTableEmpty ? (
            <EmptyState
              titleClassName="text-base"
              className="m-auto bg-mineshaft-700 text-lg"
              title={
                isTableFiltered
                  ? "No secrets to compare with current filters"
                  : "No secrets to compare"
              }
            />
          ) : (
            <Table className="border-collapse bg-mineshaft-700">
              <THead className="sticky top-0 z-20">
                <Tr className="sticky top-0 z-20">
                  <Th className="sticky left-0 z-10 border-none p-0" style={{ width: colWidth }}>
                    <div className="relative">
                      <div
                        tabIndex={-1}
                        role="button"
                        className={`absolute -right-[0.02rem] z-40 h-full w-0.5 cursor-ew-resize hover:bg-blue-400/20 ${
                          isResizing ? "bg-blue-400/75" : "bg-transparent"
                        }`}
                        onMouseDown={handleMouseDown}
                      />
                      <div className="pointer-events-none absolute -right-[0.02rem] top-[0.67rem] z-30">
                        <div className="h-5 w-0.5 rounded-[1.5px] bg-gray-400 opacity-50" />
                      </div>
                      <div className="flex h-full items-center border-b-2 border-r border-mineshaft-500 bg-mineshaft-700 bg-clip-padding p-0 px-4 py-2.5 text-sm normal-case">
                        Name
                        <IconButton
                          variant="plain"
                          className="ml-1 mt-[0.1rem]"
                          ariaLabel="sort"
                          onClick={() =>
                            setOrderDirection((prev) =>
                              prev === OrderByDirection.ASC
                                ? OrderByDirection.DESC
                                : OrderByDirection.ASC
                            )
                          }
                        >
                          <FontAwesomeIcon
                            className="h-3"
                            icon={orderDirection === "asc" ? faArrowDown : faArrowUp}
                          />
                        </IconButton>
                      </div>
                    </div>
                  </Th>
                  {compareEnvironments?.map(({ name, slug }, index) => {
                    const envSecKeyCount = getEnvSecretKeyCount(slug);
                    const importedSecKeyCount = getEnvImportedSecretKeyCount(slug);
                    const missingKeyCount = secKeys.length - envSecKeyCount - importedSecKeyCount;

                    return (
                      <Th
                        className="whitespace-nowrap border-none p-0 text-center"
                        key={`environment-${slug}`}
                      >
                        <div
                          className={twMerge(
                            "flex h-full w-full items-center justify-center gap-x-2 border-b-2 border-mineshaft-500 bg-mineshaft-700 p-0 px-4 py-2.5 text-center text-sm normal-case",
                            index < compareEnvironments.length - 1 && "border-r"
                          )}
                        >
                          {name}
                          {missingKeyCount > 0 && (
                            <Tooltip
                              className="max-w-none lowercase"
                              content={
                                <>
                                  {missingKeyCount} secret{missingKeyCount > 1 ? "s" : ""} missing
                                  compared to other environments on this page
                                </>
                              }
                            >
                              <Badge
                                variant="primary"
                                className="-mt-[0.05rem] flex h-4 items-center gap-x-1 pt-[0.1rem] font-normal leading-3"
                              >
                                <FontAwesomeIcon icon={faWarning} className="-mt-[0.1rem] w-2.5" />
                                {missingKeyCount}
                              </Badge>
                            </Tooltip>
                          )}
                        </div>
                      </Th>
                    );
                  })}
                </Tr>
              </THead>
              <TBody>
                {folderNamesAndDescriptions.map(({ name: folderName }, index) => (
                  <FolderRow
                    folderName={folderName}
                    isFolderPresentInEnv={isFolderPresentInEnv}
                    environments={compareEnvironments}
                    key={`overview-${folderName}-${index + 1}`}
                    colWidth={colWidth}
                  />
                ))}
                {dynamicSecretNames.map((dynamicSecretName, index) => (
                  <DynamicSecretRow
                    dynamicSecretName={dynamicSecretName}
                    isDynamicSecretInEnv={isDynamicSecretPresentInEnv}
                    environments={compareEnvironments}
                    key={`overview-${dynamicSecretName}-${index + 1}`}
                    colWidth={colWidth}
                  />
                ))}
                {secretRotationNames.map((secretRotationName, index) => (
                  <SecretRotationRow
                    secretRotationName={secretRotationName}
                    isSecretRotationInEnv={isSecretRotationPresentInEnv}
                    environments={compareEnvironments}
                    getSecretRotationByName={getSecretRotationByName}
                    key={`overview-${secretRotationName}-${index + 1}`}
                    colWidth={colWidth}
                    tableWidth={tableWidth}
                  />
                ))}
                {secKeys.map((key, index) => (
                  <SecretRow
                    colWidth={colWidth}
                    secretPath={secretPath}
                    getImportedSecretByKey={getImportedSecretByKey}
                    isImportedSecretPresentInEnv={handleIsImportedSecretPresentInEnv}
                    key={`overview-${key}-${index + 1}`}
                    environments={compareEnvironments}
                    secretKey={key}
                    getSecretByKey={getSecretByKey}
                    tableWidth={tableWidth}
                  />
                ))}
                <SecretNoAccessRow
                  colWidth={colWidth}
                  environments={compareEnvironments}
                  count={Math.max(
                    (page * perPage > totalCount ? totalCount % perPage : perPage) -
                      (totalUniqueFoldersInPage || 0) -
                      (totalUniqueDynamicSecretsInPage || 0) -
                      (totalUniqueSecretsInPage || 0) -
                      (totalUniqueSecretImportsInPage || 0) -
                      (totalUniqueSecretRotationsInPage || 0),
                    0
                  )}
                />
              </TBody>
            </Table>
          )}
        </TableContainer>
      </div>
      <div className="mt-3 flex flex-row items-center justify-center space-x-2">
        <Input
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="h-full flex-1"
          placeholder="Search by resource name..."
          leftIcon={<FontAwesomeIcon icon={faSearch} />}
          containerClassName="h-10"
        />
        {isTableFiltered && (
          <Button
            variant="plain"
            colorSchema="secondary"
            onClick={() => {
              setFilter(DEFAULT_FILTER_STATE);
            }}
          >
            Clear Filters
          </Button>
        )}
        {compareEnvironments.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline_bg"
                className={twMerge(
                  "flex h-[2.5rem]",
                  isTableFiltered && "border-primary/40 bg-primary/10"
                )}
                leftIcon={
                  <FontAwesomeIcon
                    icon={faFilter}
                    className={isTableFiltered ? "text-primary/80" : undefined}
                  />
                }
              >
                Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="thin-scrollbar max-h-[70vh] overflow-y-auto"
              align="end"
              sideOffset={2}
            >
              <DropdownMenuLabel>Filter by Resource</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleRowType(RowType.Folder);
                }}
                icon={filter[RowType.Folder] && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faFolder} className="text-yellow-700" />
                  <span>Folders</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleRowType(RowType.DynamicSecret);
                }}
                icon={filter[RowType.DynamicSecret] && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faFingerprint} className="text-yellow-700" />
                  <span>Dynamic Secrets</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleRowType(RowType.SecretRotation);
                }}
                icon={filter[RowType.SecretRotation] && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faRotate} className="text-mineshaft-400" />
                  <span>Secret Rotations</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleRowType(RowType.Secret);
                }}
                icon={filter[RowType.Secret] && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faKey} className="text-bunker-300" />
                  <span>Secrets</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="!z-[99999999]">
        <FormLabel label="Select Environments to Compare" />
        <FilterableSelect
          value={selectedEnvironments}
          onChange={(value) => {
            const selected = value as MultiValue<WorkspaceEnv>;

            setSelectedEnvironments((selected as WorkspaceEnv[]) ?? []);
          }}
          placeholder="Leave blank to compare all environments"
          options={currentWorkspace.environments}
          getOptionValue={(option) => option.slug}
          getOptionLabel={(option) => option.name}
          isMulti
        />
      </div>
    </div>
  );
};
