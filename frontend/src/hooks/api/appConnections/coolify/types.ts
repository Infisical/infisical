export enum CoolifyResourceType {
  Application = "application",
  Service = "service",
  Database = "database"
}

export type TCoolifyResource = {
  id: string;
  name: string;
  type: CoolifyResourceType;
  projectName: string;
  environmentName: string;
};
