export type TGitHubApp = {
  id: string | null;
  orgId: string;
  projectId: string | null;
  name: string;
  appId: string;
  slug: string;
  clientId: string | null;
  owner: string | null;
  host: string | null;
  instanceType: "cloud" | "server" | null;
  connectionCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};
