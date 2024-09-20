import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  faArrowDown,
  faArrowUp,
  faFolderBlank,
  faMagnifyingGlass,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useDebounce, usePopUp } from "@app/hooks";
import { useGetUserSecrets } from "@app/hooks/api";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

enum RowType {
  Folder = "folder",
  DynamicSecret = "dynamic",
  Secret = "Secret"
}

const INIT_PER_PAGE = 20;

export const UserSecretPage = () => {
  const router = useRouter();

  const parentTableRef = useRef<HTMLTableElement>(null);
  const [, setExpandableTableWidth] = useState(0);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (parentTableRef.current) {
      setExpandableTableWidth(parentTableRef.current.clientWidth);
    }
  }, [parentTableRef.current]);

  const [searchFilter, setSearchFilter] = useState("");
  const debouncedSearchFilter = useDebounce(searchFilter);

  const [, setSelectedEntries] = useState<{
    [EntryType.FOLDER]: Record<string, boolean>;
    [EntryType.SECRET]: Record<string, boolean>;
  }>({
    [EntryType.FOLDER]: {},
    [EntryType.SECRET]: {}
  });

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(INIT_PER_PAGE);

  const resetSelectedEntries = useCallback(() => {
    setSelectedEntries({
      [EntryType.FOLDER]: {},
      [EntryType.SECRET]: {}
    });
  }, []);

  useEffect(() => {
    const handleParentTableWidthResize = () => {
      setExpandableTableWidth(parentTableRef.current?.clientWidth || 0);
    };

    const onRouteChangeStart = () => {
      resetSelectedEntries();
    };

    router.events.on("routeChangeStart", onRouteChangeStart);

    window.addEventListener("resize", handleParentTableWidthResize);
    return () => {
      window.removeEventListener("resize", handleParentTableWidthResize);
      router.events.off("routeChangeStart", onRouteChangeStart);
    };
  }, []);

  const { data: secrets, secKeys } = useGetUserSecrets({});

  const { handlePopUpOpen } = usePopUp(["addUserSecrets", "misc"] as const);

  const rows = useMemo(() => {
    const filteredSecretNames =
      secKeys
        ?.filter((name) => name.toUpperCase().includes(debouncedSearchFilter.toUpperCase()))
        .sort((a, b) => (sortDir === "asc" ? a.localeCompare(b) : b.localeCompare(a))) ?? [];

    return [...filteredSecretNames.map((name) => ({ name, type: RowType.Secret }))];
  }, [sortDir, debouncedSearchFilter, secKeys]);

  const paginationOffset = (page - 1) * perPage;

  useEffect(() => {
    // reset page if no longer valid
    if (rows.length < paginationOffset) setPage(1);
  }, [rows.length]);

  const isTableLoading = secrets?.some(({ isLoading }) => isLoading);

  if (isTableLoading) {
    return (
      <div className="container mx-auto flex h-screen w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="loading animation"
          decoding="async"
          loading="lazy"
        />
      </div>
    );
  }

  const isTableEmpty = !secrets?.every(({ isLoading }) => isLoading) && rows.length === 0;

  return (
    <div className="container mx-auto px-6 text-mineshaft-50 dark:[color-scheme:dark]">
      <div className="space-y-8">
        <div className="mt-6">
          <p className="text-3xl font-semibold text-bunker-100">User Secrets</p>
          <p className="text-md text-bunker-300">
            These secrets are only accessible by you. You can inject secrets using
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/cli/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical CLI
            </a>
            ,
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/documentation/getting-started/api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical API
            </a>
            ,
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/sdks/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical SDKs
            </a>
            , and
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/documentation/getting-started/introduction"
              target="_blank"
              rel="noopener noreferrer"
            >
              more
            </a>
            .
          </p>
        </div>
        <div className="flex items-center justify-between">
          <div />
          <div className="flex flex-row items-center justify-center space-x-2">
            <div className="w-80">
              <Input
                className="h-[2.3rem] bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
                placeholder="Search by secret/folder name..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              />
            </div>
            <div>
              <Button
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("addUserSecrets")}
                className="h-10"
              >
                Add Secret
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="thin-scrollbar mt-4" ref={parentTableRef}>
        <TableContainer>
          <Table>
            <THead>
              <Tr className="sticky top-0 z-20 border-0">
                <Th className="sticky left-0 z-20 min-w-[20rem] border-b-0 p-0">
                  <div className="flex h-12 items-center border-b border-r border-mineshaft-600 px-5 pt-3.5 pb-3">
                    Name
                    <IconButton
                      variant="plain"
                      className="ml-2"
                      ariaLabel="sort"
                      onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                    >
                      <FontAwesomeIcon icon={sortDir === "asc" ? faArrowDown : faArrowUp} />
                    </IconButton>
                  </div>
                </Th>
                <Th className="sticky left-0 z-20 min-w-[20rem] border-b-0 p-0">
                  <div className="flex h-12 items-center border-b border-r border-mineshaft-600 px-5 pt-3.5 pb-3">
                    Type
                  </div>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {isTableLoading && (
                <TableSkeleton
                  columns={2} // key + type
                  innerKey="secret-overview-loading"
                  rows={5}
                  className="bg-mineshaft-700"
                />
              )}
              {isTableEmpty && !isTableLoading && (
                <Tr>
                  <Td colSpan={2}>
                    <EmptyState
                      title={
                        debouncedSearchFilter
                          ? "No secret found for your search, add one now"
                          : "Let's add some secrets"
                      }
                      icon={faFolderBlank}
                      iconSize="3x"
                    >
                      <Button
                        className="mt-4"
                        variant="outline_bg"
                        colorSchema="primary"
                        size="md"
                        onClick={() => handlePopUpOpen("addUserSecrets")}
                      >
                        Add Secrets
                      </Button>
                    </EmptyState>
                  </Td>
                </Tr>
              )}
              {!isTableLoading &&
                rows.slice(paginationOffset, paginationOffset + perPage).map((row) => {
                  switch (row.type) {
                    case RowType.Secret:
                      return null;
                    default:
                      return null;
                  }
                })}
            </TBody>
          </Table>
          {!isTableLoading && rows.length > INIT_PER_PAGE && (
            <Pagination
              className="border-t border-solid border-t-mineshaft-600"
              count={rows.length}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
            />
          )}
        </TableContainer>
      </div>
    </div>
  );
};
