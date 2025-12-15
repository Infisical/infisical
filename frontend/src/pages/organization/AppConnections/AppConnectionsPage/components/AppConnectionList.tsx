import { useMemo } from "react";
import { faInfoCircle, faMagnifyingGlass, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { EmptyState, Input, Pagination, Spinner, Tooltip } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useAppConnectionOptions } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ProjectType } from "@app/hooks/api/projects/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

type Props = {
  onSelect: (app: AppConnection) => void;
  projectType?: ProjectType;
};

export const AppConnectionsSelect = ({ onSelect, projectType }: Props) => {
  const { subscription } = useSubscription();
  const { isPending, data: appConnectionOptions } = useAppConnectionOptions(projectType);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("", {
    initPerPage: 16
  });

  const filteredOptions = useMemo(
    () =>
      appConnectionOptions?.filter(
        ({ name, app }) =>
          name?.toLowerCase().includes(search.trim().toLowerCase()) ||
          app.toLowerCase().includes(search.toLowerCase())
      ) ?? [],
    [appConnectionOptions, search]
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
      <div className="grid h-118 grid-cols-4 content-start gap-2">
        {filteredOptions.slice(offset, perPage * page)?.map((option) => {
          const {
            image,
            name,
            size = 50,
            enterprise = false,
            icon
          } = APP_CONNECTION_MAP[option.app];

          return (
            <button
              key={option.app}
              type="button"
              onClick={() =>
                enterprise &&
                !subscription.get(SubscriptionProductCategory.Platform, "enterpriseAppConnections")
                  ? handlePopUpOpen("upgradePlan", {
                      isEnterpriseFeature: true
                    })
                  : onSelect(option.app)
              }
              className="group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
            >
              {image && (
                <img
                  src={`/images/integrations/${image}`}
                  style={{
                    width: `${size}px`
                  }}
                  className="mt-auto"
                  alt={`${name} logo`}
                />
              )}
              {icon && (
                <div className="relative">
                  <FontAwesomeIcon
                    className="absolute -right-1.5 -bottom-1.5 text-primary-700"
                    size="xl"
                    icon={icon}
                  />
                </div>
              )}
              <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
                {name}
              </div>
            </button>
          );
        })}
        {!filteredOptions?.length && (
          <EmptyState
            className="col-span-full mt-40"
            title="No App Connections match search"
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
        text="All App Connections can be unlocked if you switch to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </div>
  );
};
