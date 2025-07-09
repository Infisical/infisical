import { useMemo } from "react";
import { faInfoCircle, faMagnifyingGlass, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { EmptyState, Input, Pagination, Spinner, Tooltip } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { SecretSync, useSecretSyncOptions } from "@app/hooks/api/secretSyncs";

import { UpgradePlanModal } from "../license/UpgradePlanModal";

type Props = {
  onSelect: (destination: SecretSync) => void;
};

export const SecretSyncSelect = ({ onSelect }: Props) => {
  const { subscription } = useSubscription();
  const { isPending, data: secretSyncOptions } = useSecretSyncOptions();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("", {
    initPerPage: 16
  });

  const filteredOptions = useMemo(
    () =>
      secretSyncOptions?.filter(
        ({ name, destination }) =>
          name?.toLowerCase().includes(search.trim().toLowerCase()) ||
          destination.toLowerCase().includes(search.toLowerCase())
      ) ?? [],
    [secretSyncOptions, search]
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
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search options..."
        className="bg-mineshaft-800 placeholder:text-mineshaft-400"
      />
      <div className="grid h-[29.5rem] grid-cols-4 content-start gap-2">
        {filteredOptions.slice(offset, perPage * page)?.map(({ destination, enterprise }) => {
          const { image, name } = SECRET_SYNC_MAP[destination];
          return (
            <button
              type="button"
              onClick={() =>
                enterprise && !subscription.enterpriseSecretSyncs
                  ? handlePopUpOpen("upgradePlan")
                  : onSelect(destination)
              }
              className="group relative flex h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
            >
              <img
                src={`/images/integrations/${image}`}
                height={40}
                width={40}
                className="mt-auto"
                alt={`${name} logo`}
              />
              <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
                {name}
              </div>
            </button>
          );
        })}
        {!filteredOptions?.length && (
          <EmptyState
            className="col-span-full mt-40"
            title="No Secret Syncs match search"
            icon={faSearch}
          />
        )}
      </div>
      {Boolean(filteredOptions.length) && (
        <Pagination
          startAdornment={
            <Tooltip
              side="bottom"
              className="max-w-sm py-4"
              content={
                <>
                  <p className="mb-2">Infisical is constantly adding support for more services.</p>
                  <p>
                    {`If you don't see the third-party
            service you're looking for,`}{" "}
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
                  Don&#39;t see the third-party service you&#39;re looking for?
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
      )}
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can use every Secret Sync if you switch to Infisical's Enterprise plan."
      />
    </div>
  );
};
