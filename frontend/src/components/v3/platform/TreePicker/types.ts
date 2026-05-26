import { ReactNode } from "react";

export type TTreePickerContainer = { id: string; name: string; fullPath?: string };
export type TTreePickerItem = { id: string; name: string; meta?: string };
export type TTreePickerPathEntry = { id: string; name: string };

type QueryOpts = { enabled: boolean };

// Minimal subset of a React Query result the picker reads; a UseQueryResult satisfies it
// structurally, so passthrough adapters can return query results directly.
export type TTreePickerQueryResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  isFetching?: boolean;
};

export type TTreePickerDataSource = {
  useRootContainers: (opts: QueryOpts) => TTreePickerQueryResult<TTreePickerContainer[]>;
  useSubContainers: (
    containerId: string,
    opts: QueryOpts
  ) => TTreePickerQueryResult<TTreePickerContainer[]>;
  useContainerItems: (
    containerId: string,
    opts: QueryOpts
  ) => TTreePickerQueryResult<TTreePickerItem[]>;
};

type EmptyCopy = { title: string; description?: string };

export type TreePickerProps = {
  dataSource: TTreePickerDataSource;
  path: TTreePickerPathEntry[];
  onPathChange: (path: TTreePickerPathEntry[]) => void;
  selectedItemId: string;
  onSelectItem: (item: { id: string; name: string }) => void;
  disabled?: boolean;
  rootLabel: string;
  subContainersHeading?: string;
  itemsHeading?: string;
  emptyRoot: EmptyCopy;
  emptyContainer: EmptyCopy;
  containerIcon?: ReactNode;
  itemIcon?: ReactNode;
};
