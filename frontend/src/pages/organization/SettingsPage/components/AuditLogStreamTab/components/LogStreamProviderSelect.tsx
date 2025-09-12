import { useMemo } from "react";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { EmptyState, Spinner } from "@app/components/v2";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetAuditLogStreamOptions } from "@app/hooks/api";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";

type Props = {
  onSelect: (provider: LogProvider) => void;
};

// TODO: When we have more than 1 page of providers, uncomment the search components

export const LogStreamProviderSelect = ({ onSelect }: Props) => {
  const { isPending, data: logStreamOptions } = useGetAuditLogStreamOptions();

  const { search, setPage, page, perPage, offset } = usePagination("", {
    initPerPage: 16
  });

  const filteredOptions = useMemo(
    () =>
      (logStreamOptions || [])
        .filter(
          ({ name, provider }) =>
            name.toLowerCase().includes(search.trim().toLowerCase()) ||
            provider.toLowerCase().includes(search.trim().toLowerCase())
        )
        .sort((a, b) => {
          if (a.provider === LogProvider.Custom) return 1;
          if (b.provider === LogProvider.Custom) return -1;
          return 0;
        }),
    [logStreamOptions, search]
  );

  useResetPageHelper({
    totalCount: filteredOptions.length,
    offset,
    setPage
  });

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Loading options...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search options..."
        className="bg-mineshaft-800 placeholder:text-mineshaft-400"
      /> */}
      <div className="grid h-[29.5rem] grid-cols-4 content-start gap-2">
        {filteredOptions.slice(offset, perPage * page)?.map((option) => {
          const { image, icon, name, size = 50 } = AUDIT_LOG_STREAM_PROVIDER_MAP[option.provider];

          return (
            <button
              type="button"
              onClick={() => onSelect(option.provider)}
              className={`group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 ${option.provider === LogProvider.Custom ? "bg-mineshaft-700/30 hover:bg-mineshaft-600/30" : "bg-mineshaft-700 hover:bg-mineshaft-600"} p-4 duration-200`}
            >
              {image && (
                <div className="relative">
                  <img
                    src={`/images/integrations/${image}`}
                    style={{
                      width: `${size}px`
                    }}
                    className="mt-auto"
                    alt={`${name} logo`}
                  />
                </div>
              )}
              {icon && (
                <FontAwesomeIcon className="mt-auto size-10 text-mineshaft-300" icon={icon} />
              )}
              <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
                {name}
              </div>
            </button>
          );
        })}
        {!filteredOptions.length && (
          <EmptyState
            className="col-span-full mt-40"
            title="No providers match search"
            icon={faSearch}
          />
        )}
      </div>
      {/* {Boolean(filteredOptions.length) && (
        <Pagination
          startAdornment={
            <Tooltip
              side="bottom"
              className="max-w-sm py-4"
              content={
                <>
                  <p className="mb-2">Infisical is constantly adding support for more providers.</p>
                  <p>
                    {`If you don't see the third-party
            provider you're looking for,`}{" "}
                    <a
                      target="_blank"
                      className="underline hover:text-mineshaft-300"
                      href="https://infisical.com/slack"
                      rel="noopener noreferrer"
                    >
                      let us know on Slack
                    </a>{" "}
                    or{" "}
                    <a
                      target="_blank"
                      className="underline hover:text-mineshaft-300"
                      href="https://github.com/Infisical/infisical/discussions"
                      rel="noopener noreferrer"
                    >
                      make a request on GitHub
                    </a>
                    .
                  </p>
                </>
              }
            >
              <div className="-ml-3 flex items-center gap-1.5 text-mineshaft-400">
                <span className="text-xs">
                  Don&#39;t see the third-party provider you&#39;re looking for?
                </span>
                <FontAwesomeIcon size="xs" icon={faInfoCircle} />
              </div>
            </Tooltip>
          }
          count={filteredOptions.length}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={setPerPage}
          perPageList={[16]}
        />
      )} */}
    </div>
  );
};
