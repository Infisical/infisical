export type TRootAppConnection = {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  isPlatformManagedCredentials?: boolean;
  gatewayId?: string | null;
};
