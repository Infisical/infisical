import { useMemo } from "react";
import { faInfoCircle, faMagnifyingGlass, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { EmptyState, Input, Pagination, Spinner, Tooltip } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  PAM_RESOURCE_TYPE_MAP,
  PamResourceType,
  useListPamResourceOptions
} from "@app/hooks/api/pam";

type Props = {
  onSelect: (resource: PamResourceType) => void;
};

export const ResourceTypeSelect = ({ onSelect }: Props) => {
  const { isPending, data: resourceOptions } = useListPamResourceOptions();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const appendedResourceOptions = useMemo(() => {
    if (!resourceOptions) return [];
    return [
      ...resourceOptions,
      // We are temporarily showing these resources so that we can gauge interest before committing
      { name: "RDP", resource: PamResourceType.RDP },
      { name: "SSH", resource: PamResourceType.SSH },
      { name: "Kubernetes", resource: PamResourceType.Kubernetes }
    ];
  }, [resourceOptions]);

  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("", {
    initPerPage: 16
  });

  const filteredOptions = useMemo(
    () =>
      appendedResourceOptions?.filter(
        ({ name, resource }) =>
          name.toLowerCase().includes(search.trim().toLowerCase()) ||
          resource.toLowerCase().includes(search.trim().toLowerCase())
      ) ?? [],
    [appendedResourceOptions, search]
  );

  useResetPageHelper({
    totalCount: filteredOptions.length,
    offset,
    setPage
  });

  const handleResourceSelect = (resource: PamResourceType) => {
    if (!subscription.pam) {
      handlePopUpOpen(
        "upgradePlan",
        "PAM (Privileged Access Management) requires an enterprise plan."
      );
      return;
    }

    // We temporarily show a special license modal for these because we will have to write some code to complete the integration
    if (
      resource === PamResourceType.RDP ||
      resource === PamResourceType.SSH ||
      resource === PamResourceType.Kubernetes
    ) {
      handlePopUpOpen(
        "upgradePlan",
        "This resource type requires a special license add-on to be enabled in your enterprise plan."
      );
      return;
    }

    onSelect(resource);
  };

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
          const { image, name, size = 50 } = PAM_RESOURCE_TYPE_MAP[option.resource];

          return (
            <button
              type="button"
              onClick={() => handleResourceSelect(option.resource)}
              className="group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
            >
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
              <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
                {name}
              </div>
            </button>
          );
        })}
        {!filteredOptions?.length && (
          <EmptyState
            className="col-span-full mt-40"
            title="No resources match search"
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
                  <p className="mb-2">Infisical is constantly adding support for more resources.</p>
                  <p>
                    {"If you don't see the resource you're looking for,"}{" "}
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
                <span className="text-xs">Don&#39;t see the resource you&#39;re looking for?</span>
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
        text={popUp.upgradePlan.data || ""}
      />
    </div>
  );
};
