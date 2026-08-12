export enum SandboxStatus {
  Stopped = "stopped",
  Running = "running"
}

export type TSandboxGrants = {
  pamAccountIds: string[];
  proxiedServiceIds: string[];
  clis: string[];
};

export type TSandbox = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  status: SandboxStatus;
  vcpu: number;
  memoryMb: number;
  grants: TSandboxGrants;
  createdAt: string;
  lastActivityAt: string | null;
  commandsRun: number;
};

export type TSandboxExecResult = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  cwd: string;
  wasTruncated: boolean;
  timedOut: boolean;
};

export type TCreateSandboxDTO = {
  name: string;
  description?: string;
  vcpu: number;
  memoryMb: number;
  grants?: Partial<TSandboxGrants>;
};

export type TUpdateSandboxDTO = {
  sandboxId: string;
  name?: string;
  description?: string;
  vcpu?: number;
  memoryMb?: number;
  grants?: Partial<TSandboxGrants>;
};
