import { Fragment, useCallback } from "react";
import { InfiniteData } from "@tanstack/react-query";
import { formatDistance } from "date-fns";

import { Button, Drawer, DrawerContent } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { TSecretSnapshot } from "@app/hooks/api/secretSnapshots/types";

type Props = {
  isDrawerOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretSnaphots?: InfiniteData<TSecretSnapshot[]>;
  onSelectSnapshot: (id: string) => void;
  snapshotId: string | null;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  fetchNextPage: () => void;
};

export const PitDrawer = ({
  isDrawerOpen,
  onOpenChange,
  secretSnaphots,
  onSelectSnapshot,
  snapshotId,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage
}: Props): JSX.Element => {
  const getButtonLabel = useCallback((isFirstChild: boolean, isSelectedSnapshot: boolean) => {
    if (isFirstChild) return "Current Version";
    if (isSelectedSnapshot) return "Currently Viewing";
    return "Explore";
  }, []);

  return (
    <Drawer isOpen={isDrawerOpen} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Point-in-time Recovery"
        subTitle="Note: This will recover secrets for all environments in this project"
      >
        <div className="flex flex-col space-y-2">
          <NoticeBannerV2 title="Snapshots are being deprecated" className="mb-2">
            <p className="my-1 text-sm text-mineshaft-300">
              Snapshots will be replaced by{" "}
              <a
                target="_blank"
                href="https://infisical.com/docs/documentation/platform/pit-recovery"
                rel="noopener noreferrer"
                className="underline decoration-primary underline-offset-2 hover:text-mineshaft-200"
              >
                Commits
              </a>{" "}
              to track history going forward. This feature will be officially removed in November
              2025.
            </p>
          </NoticeBannerV2>
          {secretSnaphots?.pages?.map((group, i) => (
            <Fragment key={`snapshot-item-${i + 1}`}>
              {group.map(({ id, createdAt }, index) => (
                <Button
                  key={id}
                  className="px-4 py-3 text-sm"
                  isFullWidth
                  colorSchema={
                    (i === 0 && index === 0 && snapshotId === null) || snapshotId === id
                      ? "primary"
                      : "secondary"
                  }
                  variant={
                    (i === 0 && index === 0 && snapshotId === null) || snapshotId === id
                      ? "selected"
                      : "star"
                  }
                  onClick={() => onSelectSnapshot(id)}
                >
                  <div className="flex w-full justify-between">
                    <div>
                      {(() => {
                        const distance = formatDistance(new Date(createdAt), new Date());
                        return `${distance.charAt(0).toUpperCase() + distance.slice(1)} ago`;
                      })()}
                    </div>
                    <div>{getButtonLabel(i === 0 && index === 0, snapshotId === id)}</div>
                  </div>
                </Button>
              ))}
            </Fragment>
          ))}
        </div>
        <Button
          className="mt-8 px-4 py-3 text-sm"
          isFullWidth
          variant="outline_bg"
          isLoading={isFetchingNextPage}
          isDisabled={isFetchingNextPage || !hasNextPage}
          onClick={fetchNextPage}
        >
          {hasNextPage ? "Load More" : "End of history"}
        </Button>
      </DrawerContent>
    </Drawer>
  );
};
