export interface TBasePamResource {
  id: string;
  projectId: string;
  name: string;
  gatewayId: string;
  adServerResourceId?: string | null;
  metadata?: { key: string; value: string }[];
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}
