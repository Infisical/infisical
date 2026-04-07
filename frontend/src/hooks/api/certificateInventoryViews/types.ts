export type TInventoryViewFilters = {
  status?: string;
  notAfterTo?: string | Date;
  notAfterFrom?: string | Date;
  notBeforeTo?: string | Date;
  notBeforeFrom?: string | Date;
  enrollmentTypes?: string[];
  keyAlgorithm?: string;
  keySizes?: number[];
  caIds?: string[];
  profileIds?: string[];
  source?: string;
};

export type TCertificateInventoryView = {
  id: string;
  projectId: string;
  name: string;
  filters: TInventoryViewFilters;
  columns: string[] | null;
  createdByUserId: string | null;
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
  customViews: (TCertificateInventoryView & { isSystem: false })[];
};

export type TCreateInventoryViewDTO = {
  projectId: string;
  name: string;
  filters: TInventoryViewFilters;
  columns?: string[];
};

export type TUpdateInventoryViewDTO = {
  projectId: string;
  viewId: string;
  name?: string;
  filters?: TInventoryViewFilters;
  columns?: string[];
};

export type TDeleteInventoryViewDTO = {
  projectId: string;
  viewId: string;
};
