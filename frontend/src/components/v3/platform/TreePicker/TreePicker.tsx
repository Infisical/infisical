import { ReactNode } from "react";
import { Box, ChevronLeft, ChevronRight, Folder } from "lucide-react";

import { IconButton } from "@app/components/v3/generic/IconButton";
import { cn } from "@app/components/v3/utils";

import {
  BrowserRow,
  InlineEmpty,
  ListSkeleton,
  SectionHeading,
  TREE_PICKER_SCROLL_CLASS
} from "./primitives";
import { TreePickerProps, TTreePickerContainer, TTreePickerItem } from "./types";

const ContainerList = ({
  containerIcon,
  containers,
  onDrillIn,
  emptyTitle,
  emptyDescription
}: {
  containerIcon: ReactNode;
  containers: TTreePickerContainer[];
  onDrillIn: (container: TTreePickerContainer) => void;
  emptyTitle: string;
  emptyDescription?: string;
}) => {
  if (containers.length === 0) {
    return <InlineEmpty title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      {containers.map((container) => (
        <BrowserRow
          key={container.id}
          icon={containerIcon}
          label={container.name}
          meta={
            container.fullPath && container.fullPath !== container.name
              ? container.fullPath
              : undefined
          }
          showChevron
          onClick={() => onDrillIn(container)}
        />
      ))}
    </div>
  );
};

const ContainerDetailList = ({
  containerIcon,
  itemIcon,
  subContainers,
  items,
  selectedItemId,
  subContainersHeading,
  itemsHeading,
  onDrillIn,
  onSelectItem,
  emptyTitle,
  emptyDescription
}: {
  containerIcon: ReactNode;
  itemIcon: ReactNode;
  subContainers: TTreePickerContainer[];
  items: TTreePickerItem[];
  selectedItemId: string;
  subContainersHeading: string;
  itemsHeading: string;
  onDrillIn: (container: TTreePickerContainer) => void;
  onSelectItem: (item: TTreePickerItem) => void;
  emptyTitle: string;
  emptyDescription?: string;
}) => {
  if (subContainers.length === 0 && items.length === 0) {
    return <InlineEmpty title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col">
      {subContainers.length > 0 && (
        <>
          <SectionHeading>{subContainersHeading}</SectionHeading>
          <div className="flex flex-col gap-0.5 p-1">
            {subContainers.map((subContainer) => (
              <BrowserRow
                key={subContainer.id}
                icon={containerIcon}
                label={subContainer.name}
                meta={subContainer.fullPath}
                showChevron
                onClick={() => onDrillIn(subContainer)}
              />
            ))}
          </div>
        </>
      )}
      {items.length > 0 && (
        <>
          <SectionHeading>{itemsHeading}</SectionHeading>
          <div className="flex flex-col gap-0.5 p-1">
            {items.map((item) => (
              <BrowserRow
                key={item.id}
                icon={itemIcon}
                label={item.name}
                meta={item.meta}
                isSelected={item.id === selectedItemId}
                onClick={() => onSelectItem(item)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const TreePicker = ({
  dataSource,
  path,
  onPathChange,
  selectedItemId,
  onSelectItem,
  disabled = false,
  rootLabel,
  subContainersHeading = "Folders",
  itemsHeading = "Items",
  emptyRoot,
  emptyContainer,
  containerIcon = <Folder className="text-folder" />,
  itemIcon = <Box />
}: TreePickerProps) => {
  const isEnabled = !disabled;
  const current = path[path.length - 1] ?? null;

  const rootContainersQuery = dataSource.useRootContainers({ enabled: isEnabled });

  const subContainersQuery = dataSource.useSubContainers(current?.id ?? "", {
    enabled: isEnabled && Boolean(current)
  });

  const containerItemsQuery = dataSource.useContainerItems(current?.id ?? "", {
    enabled: isEnabled && Boolean(current)
  });

  const handleDrillIn = (container: TTreePickerContainer) => {
    onPathChange([...path, { id: container.id, name: container.name }]);
  };

  const isLoading = current
    ? subContainersQuery.isLoading || containerItemsQuery.isLoading
    : rootContainersQuery.isLoading;

  return (
    <div className="flex min-w-0 flex-col">
      {path.length > 0 && (
        <div className="flex min-w-0 items-center gap-2 border-b border-border px-2 py-1.5">
          <IconButton
            aria-label="Back"
            variant="ghost-muted"
            size="xs"
            className="shrink-0"
            onClick={() => onPathChange(path.slice(0, -1))}
          >
            <ChevronLeft className="size-3.5" />
          </IconButton>
          <nav
            aria-label="breadcrumb"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs"
          >
            <button
              type="button"
              onClick={() => onPathChange([])}
              className="shrink-0 cursor-pointer whitespace-nowrap text-muted hover:text-foreground"
            >
              {rootLabel}
            </button>
            {path.map((entry, index) => {
              const isLast = index === path.length - 1;
              return (
                <span key={entry.id} className="inline-flex min-w-0 items-center gap-1">
                  <ChevronRight className="size-3 shrink-0 text-muted/70" />
                  {isLast ? (
                    <span aria-current="page" className="truncate text-foreground">
                      {entry.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPathChange(path.slice(0, index + 1))}
                      className="cursor-pointer truncate text-muted hover:text-foreground"
                    >
                      {entry.name}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        </div>
      )}

      <div className={cn(TREE_PICKER_SCROLL_CLASS, "p-1")}>
        {(() => {
          if (isLoading) return <ListSkeleton />;

          if (!current) {
            return (
              <ContainerList
                containerIcon={containerIcon}
                containers={rootContainersQuery.data ?? []}
                onDrillIn={handleDrillIn}
                emptyTitle={emptyRoot.title}
                emptyDescription={emptyRoot.description}
              />
            );
          }

          return (
            <ContainerDetailList
              containerIcon={containerIcon}
              itemIcon={itemIcon}
              subContainers={subContainersQuery.data ?? []}
              items={containerItemsQuery.data ?? []}
              selectedItemId={selectedItemId}
              subContainersHeading={subContainersHeading}
              itemsHeading={itemsHeading}
              onDrillIn={handleDrillIn}
              onSelectItem={onSelectItem}
              emptyTitle={emptyContainer.title}
              emptyDescription={emptyContainer.description}
            />
          );
        })()}
      </div>
    </div>
  );
};
