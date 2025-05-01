import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useInvalidateCache } from "@app/hooks/api";
import { CacheType } from "@app/hooks/api/admin/types";

export const CachingPanel = () => {
  const { mutateAsync: invalidateCache } = useInvalidateCache();
  const { membership } = useOrgPermission();

  const [type, setType] = useState<CacheType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "invalidateCache"
  ] as const);

  const handleInvalidateCacheSubmit = async () => {
    if (!type) return;
    setIsLoading(true);

    try {
      await invalidateCache({ type });

      createNotification({
        text: `Successfully invalidated ${type} cache`,
        type: "success"
      });

      setType(null);
      handlePopUpClose("invalidateCache");
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to invalidate ${type} cache`,
        type: "error"
      });
    }

    setIsLoading(false);
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex flex-col">
          <span className="mb-2 text-xl font-semibold text-mineshaft-100">Secrets Cache</span>
          <span className="max-w-xl text-sm text-mineshaft-400">
            The secrets cache encompasses all secrets stored within the system and provides a
            temporary, secure storage location for frequently accessed credentials.
          </span>
        </div>

        <Button
          colorSchema="danger"
          isLoading={isLoading}
          onClick={() => {
            setType(CacheType.SECRETS);
            handlePopUpOpen("invalidateCache");
          }}
          isDisabled={Boolean(membership && membership.role !== "admin") || isLoading}
        >
          Invalidate Secrets Cache
        </Button>
      </div>

      {/* Uncomment this when we have more than one cache type */}
      {/* <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex flex-col">
          <span className="mb-2 text-xl font-semibold text-mineshaft-100">All Cache</span>
          <span className="max-w-xl text-sm text-mineshaft-400">
            All cache refers to the entirety of cached data throughout the system, including secrets
            and miscellaneous information.
          </span>
        </div>

        <Button
          colorSchema="danger"
          isLoading={isLoading}
          onClick={() => {
            setType(CacheType.ALL);
            handlePopUpOpen("invalidateCache");
          }}
          isDisabled={Boolean(membership && membership.role !== "admin") || isLoading}
        >
          Invalidate All Cache
        </Button>
      </div> */}

      <DeleteActionModal
        isOpen={popUp.invalidateCache.isOpen}
        title={`Are you sure want to invalidate ${type} cache?`}
        subTitle="This action is permanent and irreversible. The cache clearing process may take several minutes to complete."
        onChange={(isOpen) => handlePopUpToggle("invalidateCache", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleInvalidateCacheSubmit}
      />
    </>
  );
};
