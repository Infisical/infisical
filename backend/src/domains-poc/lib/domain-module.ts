export type TApiVersion = "v1" | "v2" | "v3" | "v4";

export type TRegisterRoutes = (server: FastifyZodProvider) => Promise<void>;

export type TDomainModule<TService> = {
  name: string;
  service: TService;
  routes: Partial<Record<TApiVersion, TRegisterRoutes>>;
};
