export interface TBasePamResource {
  id: string;
  projectId: string;
  name: string;
  gatewayId: string;
  adServerResourceId?: string | null;
  createdAt: string;
  updatedAt: string;
}
