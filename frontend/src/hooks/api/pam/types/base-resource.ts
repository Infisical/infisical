export interface TBasePamResource {
  id: string;
  projectId: string;
  name: string;
  gatewayId?: string | null;
  createdAt: string;
  updatedAt: string;
}
