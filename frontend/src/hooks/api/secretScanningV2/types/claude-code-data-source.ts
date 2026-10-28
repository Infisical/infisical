import { SecretScanningDataSource } from "../enums";
import { TSecretScanningDataSourceBase } from "./shared";

export enum ClaudeCodeSecretDetectedAction {
  Block = "block",
  Report = "report"
}

export type TClaudeCodeDataSource = TSecretScanningDataSourceBase & {
  type: SecretScanningDataSource.ClaudeCode;
  config: {
    onSecretDetected: ClaudeCodeSecretDetectedAction;
  };
};

export type TClaudeCodeDataSourceOption = {
  name: string;
  type: SecretScanningDataSource.ClaudeCode;
  connection: null;
};

export type TClaudeCodeFindingDetails = {
  description: string;
  ruleID: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  entropy: number;
  author: string;
  email: string;
  date: string;
  fingerprint: string;
  sessionId?: string;
  cwd?: string;
};
