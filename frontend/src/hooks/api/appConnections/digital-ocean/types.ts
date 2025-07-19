export type TDigitalOceanAppPlatformVariable = {
  key: string;
  value: string;
  type: "SECRET" | "GENERAL";
};

export type TDigitalOceanApp = {
  id: string;
  spec: {
    name: string;
    services: Array<{
      name: string;
    }>;
    envs?: TDigitalOceanAppPlatformVariable[];
  };
};
