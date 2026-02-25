export type TInfraRunDTO = {
  hcl: string;
  mode: "plan" | "apply";
};

export enum InfraRunStatus {
  Running = "running",
  Success = "success",
  Failed = "failed"
}
