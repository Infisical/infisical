import { PamAccountType, PamHeartbeatStatus } from "../pam/pam-enums";

export type TPamHeartbeatResult = {
  accountId: string;
  projectId: string;
  accountType: PamAccountType;
  status: PamHeartbeatStatus;
  message?: string;
};

export type TCheckAccountHeartbeatDTO = {
  accountId: string;
  projectId: string;
};
