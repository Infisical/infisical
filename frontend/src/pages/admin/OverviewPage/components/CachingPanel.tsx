import { useEffect, useRef, useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Badge, Button, DeleteActionModal } from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useInvalidateCache } from "@app/hooks/api";
import { CacheType } from "@app/hooks/api/admin/types";
import { useGetInvalidatingCacheStatus } from "@app/hooks/api/admin/queries";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotate } from "@fortawesome/free-solid-svg-icons";

export const CachingPanel = () => {
  const { mutateAsync: invalidateCache } = useInvalidateCache();
  const { data: isInvalidating, refetch: refetchInvalidatingStatus } =
    useGetInvalidatingCacheStatus();
  const { membership } = useOrgPermission();

  const ignoreInitial = useRef(true);
  const [type, setType] = useState<CacheType | null>(null);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "invalidateCache"
  ] as const);

  const success = () => {
    createNotification({
      text: `Successfully invalidated cache`,
      type: "success"
    });
    setButtonsDisabled(false);
  };

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const disableButtons = () => {
    // Enable buttons after 10 seconds, even if still invalidating
    setButtonsDisabled(true);
    timeoutRef.current = setTimeout(() => {
      setButtonsDisabled(false);
    }, 10000);
  };

  const handleInvalidateCacheSubmit = async () => {
    if (!type) return;

    try {
      await invalidateCache({ type });

      createNotification({
        text: `Began invalidating ${type} cache`,
        type: "success"
      });

      disableButtons();
      handlePopUpClose("invalidateCache");

      if (!(await refetchInvalidatingStatus()).data) {
        success();
        return;
      }
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to invalidate ${type} cache`,
        type: "error"
      });
    }

    setType(null);
  };

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Update the "invalidating cache" status
  useEffect(() => {
    if (!isInvalidating) return;

    if (pollingRef.current) clearInterval(pollingRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Start polling every 3 seconds
    pollingRef.current = setInterval(async () => {
      try {
        await refetchInvalidatingStatus();
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    disableButtons();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isInvalidating]);

  // Helper to ignore the initial useEffect calls for isInvalidating
  useEffect(() => {
    const timer = setTimeout(() => {
      ignoreInitial.current = false;
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ignoreInitial.current && isInvalidating === false) {
      success();

      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [isInvalidating]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex flex-col">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-xl font-semibold text-mineshaft-100">Secrets Cache</span>
            {isInvalidating && (
              <Badge
                variant="danger"
                className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
              >
                <FontAwesomeIcon icon={faRotate} className="animate-spin" />
                Invalidating Cache
              </Badge>
            )}
          </div>
          <span className="max-w-xl text-sm text-mineshaft-400">
            The encrypted secrets cache encompasses all secrets stored within the system and
            provides a temporary, secure storage location for frequently accessed credentials.
          </span>
        </div>

        <Button
          colorSchema="danger"
          onClick={() => {
            setType(CacheType.SECRETS);
            handlePopUpOpen("invalidateCache");
          }}
          isDisabled={Boolean(membership && membership.role !== "admin") || buttonsDisabled}
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
        title={`Are you sure you want to invalidate ${type} cache?`}
        subTitle="This action is permanent and irreversible. The cache invalidation process may take several minutes to complete."
        onChange={(isOpen) => handlePopUpToggle("invalidateCache", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleInvalidateCacheSubmit}
      />
    </>
  );
};
