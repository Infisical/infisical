export type TInventoryViewFilters = {
  status?: string;
  notAfterTo?: string | Date;
  notAfterFrom?: string | Date;
  notBeforeTo?: string | Date;
  notBeforeFrom?: string | Date;
  enrollmentTypes?: string[];
  keyAlgorithm?: string | string[];
  keySizes?: number[];
  caIds?: string[];
  profileIds?: string[];
  source?: string | string[];
};

export type TCertificateInventoryView = {
  id: string;
  projectId: string;
  name: string;
  filters: TInventoryViewFilters;
  columns: string[] | null;
  createdByUserId: string | null;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TSystemViewFilters = {
  status?: string[];
  notAfterTo?: string;
};

export type TSystemView = {
  id: string;
  name: string;
  filters: TSystemViewFilters;
  columns: null;
  isSystem: true;
  createdByUserId: null;
};

export type TListInventoryViewsResponse = {
  systemViews: TSystemView[];
  sharedViews: (TCertificateInventoryView & { isSystem: false; isShared: true })[];
  customViews: (TCertificateInventoryView & { isSystem: false; isShared: false })[];
};

export type TCreateInventoryViewDTO = {
  projectId: string;
  name: string;
  filters: TInventoryViewFilters;
  columns?: string[];
  isShared?: boolean;
};

export type TUpdateInventoryViewDTO = {
  projectId: string;
  viewId: string;
  name?: string;
  filters?: TInventoryViewFilters;
  columns?: string[];
  isShared?: boolean;
};

export type TDeleteInventoryViewDTO = {
  projectId: string;
  viewId: string;
};
