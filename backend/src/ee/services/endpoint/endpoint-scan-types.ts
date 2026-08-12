export type TUpdateEndpointScanPolicyDTO = {
  isEnabled: boolean;
  roots: string[];
  excludePatterns: string[];
  maxFileMegabytes?: number;
  intervalHours: number;
};

export type TListEndpointSecretFindingsDTO = {
  deviceId?: string;
};

export type TRequestEndpointScanDTO = {
  deviceId: string;
};

export type TEndpointScanFindingDTO = {
  fingerprint: string;
  ruleId: string;
  description?: string;
  file: string;
  startLine: number;
  entropy?: number;
  redactedMatch?: string;
  fileModifiedAt?: string;
};

export type TReportEndpointScanResultDTO = {
  result: {
    scanRequestId?: string;
    trigger: string;
    startedAt: string;
    finishedAt: string;
    rootsScanned: string[];
    inaccessibleRoots?: string[];
    filesScanned: number;
    truncated: boolean;
    findings: TEndpointScanFindingDTO[];
  };
};
