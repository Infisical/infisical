export enum RotationPolicyType {
  LocalWindows = "local-windows",
  DomainWindows = "domain-windows",
  Postgres = "postgres"
}

export const ROTATION_POLICY_TYPE_MAP: Record<RotationPolicyType, { name: string; image: string }> =
  {
    [RotationPolicyType.LocalWindows]: { name: "Local Windows Accounts", image: "Windows.png" },
    [RotationPolicyType.DomainWindows]: {
      name: "Domain Windows Accounts",
      image: "ActiveDirectory.png"
    },
    [RotationPolicyType.Postgres]: { name: "PostgreSQL Accounts", image: "Postgres.png" }
  };

export type MatchingPattern = {
  accountNames: string;
  resourceNames?: string;
  domainName?: string;
};

export type RotationRun = {
  id: string;
  startedAt: string;
  duration: string;
  triggeredBy: string;
  status: "completed" | "partial" | "failed";
  rotatedCount: number;
};

export type RotationPolicy = {
  id: string;
  name: string;
  type: RotationPolicyType;
  status: "active" | "inactive";
  schedule: string;
  lastRun: string;
  nextRun: string;
  rotationIntervalDays: number;
  credentials: {
    username: string;
  } | null;
  allowPatterns: MatchingPattern[];
  denyPatterns: MatchingPattern[];
  runs: RotationRun[];
};

export const MOCK_ROTATION_POLICIES: RotationPolicy[] = [
  {
    id: "rp-1",
    name: "PostgreSQL Admin Rotation",
    type: RotationPolicyType.Postgres,
    status: "active",
    schedule: "Weekly",
    lastRun: "03/23/2026, 02:00 AM",
    nextRun: "03/30/2026, 02:00 AM",
    rotationIntervalDays: 30,
    credentials: { username: "rotation_admin" },
    allowPatterns: [{ accountNames: "app_*, postgres", resourceNames: "prod-*, *" }],
    denyPatterns: [{ accountNames: "readonly_*", resourceNames: "*" }],
    runs: [
      {
        id: "run-1",
        startedAt: "Mar 23, 2026 02:00 AM",
        duration: "45s",
        triggeredBy: "Scheduled",
        status: "completed",
        rotatedCount: 3
      },
      {
        id: "run-2",
        startedAt: "Mar 16, 2026 02:00 AM",
        duration: "52s",
        triggeredBy: "Scheduled",
        status: "partial",
        rotatedCount: 2
      }
    ]
  },
  {
    id: "rp-2",
    name: "Domain Service Accounts",
    type: RotationPolicyType.DomainWindows,
    status: "active",
    schedule: "Monthly",
    lastRun: "03/01/2026, 03:00 AM",
    nextRun: "04/01/2026, 03:00 AM",
    rotationIntervalDays: 60,
    credentials: { username: "svc_rotator" },
    allowPatterns: [{ accountNames: "svc_*", domainName: "corp.example.com" }],
    denyPatterns: [{ accountNames: "svc_krbtgt", domainName: "corp.example.com" }],
    runs: [
      {
        id: "run-3",
        startedAt: "Mar 01, 2026 03:00 AM",
        duration: "2m 15s",
        triggeredBy: "Scheduled",
        status: "completed",
        rotatedCount: 8
      },
      {
        id: "run-4",
        startedAt: "Feb 01, 2026 03:00 AM",
        duration: "2m 30s",
        triggeredBy: "Scheduled",
        status: "failed",
        rotatedCount: 0
      }
    ]
  },
  {
    id: "rp-3",
    name: "Local Admin Rotation",
    type: RotationPolicyType.LocalWindows,
    status: "inactive",
    schedule: "Biweekly",
    lastRun: "03/10/2026, 01:00 AM",
    nextRun: "-",
    rotationIntervalDays: 14,
    credentials: null,
    allowPatterns: [{ accountNames: "Administrator", resourceNames: "win-srv-*" }],
    denyPatterns: [],
    runs: [
      {
        id: "run-5",
        startedAt: "Mar 10, 2026 01:00 AM",
        duration: "1m 05s",
        triggeredBy: "Manual",
        status: "completed",
        rotatedCount: 5
      }
    ]
  }
];
