import { Fragment, useCallback } from "react";
import { InfiniteData } from "@tanstack/react-query";

import { Button, Drawer, DrawerContent } from "@app/components/v2";
import timeSince from "@app/ee/utilities/timeSince";
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
          {secretSnaphots?.pages?.map((group, i) => (
            <Fragment key={`snapshot-item-${i + 1}`}>
              {group.map(({ _id, createdAt }, index) => (
                <Button
                  key={_id}
                  className="py-3 px-4 text-sm"
                  isFullWidth
                  colorSchema={
                    (i === 0 && index === 0 && snapshotId === null) || snapshotId === _id
                      ? "primary"
                      : "secondary"
                  }
                  variant={
                    (i === 0 && index === 0 && snapshotId === null) || snapshotId === _id
                      ? "selected"
                      : "star"
                  }
                  onClick={() => onSelectSnapshot(_id)}
                >
                  <div className="flex w-full justify-between">
                    <div>{timeSince(new Date(createdAt))}</div>
                    <div>{getButtonLabel(i === 0 && index === 0, snapshotId === _id)}</div>
                  </div>
                </Button>
              ))}
            </Fragment>
          ))}
        </div>
        <Button
          className="mt-8 py-3 px-4 text-sm"
          isFullWidth
          variant="star"
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
