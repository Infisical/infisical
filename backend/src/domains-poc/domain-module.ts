export type TDomainRoutes = {
  ee?: (server: FastifyZodProvider) => Promise<void>;
  community?: (server: FastifyZodProvider) => Promise<void>;
};

export type TDomainModule<TService> = {
  name: string;
  service: TService;
  routes: {
    v1?: TDomainRoutes;
    v2?: TDomainRoutes;
    v3?: TDomainRoutes;
    v4?: TDomainRoutes;
  };
};
