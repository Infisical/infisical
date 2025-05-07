import { useEffect, useState } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Badge, Button, DeleteActionModal } from "@app/components/v2";
import { useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useInvalidateCache } from "@app/hooks/api";
import { useGetInvalidatingCacheStatus } from "@app/hooks/api/admin/queries";
import { CacheType } from "@app/hooks/api/admin/types";

export const CachingPanel = () => {
  const { mutateAsync: invalidateCache } = useInvalidateCache();
  const { user } = useUser();

  const [type, setType] = useState<CacheType | null>(null);
  const [shouldPoll, setShouldPoll] = useState(false);

  const {
    data: invalidationStatus,
    isFetching,
    refetch
  } = useGetInvalidatingCacheStatus(shouldPoll);
  const isInvalidating = Boolean(shouldPoll && (isFetching || invalidationStatus));

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "invalidateCache"
  ] as const);

  const handleInvalidateCacheSubmit = async () => {
    if (!type || isInvalidating) return;

    try {
      await invalidateCache({ type });
      createNotification({ text: `Began invalidating ${type} cache`, type: "success" });
      setShouldPoll(true);
      handlePopUpClose("invalidateCache");
    } catch (err) {
      console.error(err);
      createNotification({ text: `Failed to invalidate ${type} cache`, type: "error" });
    }
  };

  useEffect(() => {
    if (isInvalidating) return;

    if (shouldPoll) {
      setShouldPoll(false);
      createNotification({ text: "Successfully invalidated cache", type: "success" });
    }
  }, [isInvalidating, shouldPoll]);

  useEffect(() => {
    refetch().then((v) => setShouldPoll(v.data || false));
  }, []);

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
          isDisabled={!user.superAdmin || isInvalidating}
        >
          Invalidate Secrets Cache
        </Button>
      </div>
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
