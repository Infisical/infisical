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

export type RotationRunAccountError = {
  accountName: string;
  error: string;
};

export type RotationRun = {
  id: string;
  startedAt: string;
  duration: string;
  triggeredBy: string;
  status: "completed" | "partial" | "failed";
  rotatedCount: number;
  accountErrors?: RotationRunAccountError[];
};

export type RotationPolicy = {
  id: string;
  name: string;
  type: RotationPolicyType;
  status: "active" | "inactive";
  scheduleDays: number;
  lastRun: string;
  nextRun: string;
  credentials: {
    username: string;
  } | null;
  allowPattern: MatchingPattern;
  runs: RotationRun[];
};

export const MOCK_ROTATION_POLICIES: RotationPolicy[] = [
  {
    id: "rp-1",
    name: "PostgreSQL Admin Rotation",
    type: RotationPolicyType.Postgres,
    status: "active",
    scheduleDays: 30,
    lastRun: "03/23/2026, 02:00 AM",
    nextRun: "03/30/2026, 02:00 AM",
    credentials: { username: "rotation_admin" },
    allowPattern: { accountNames: "app_*, postgres", resourceNames: "prod-*, *" },
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
        rotatedCount: 2,
        accountErrors: [
          {
            accountName: "app_analytics",
            error: "Connection timeout after 30s — could not reach host db-analytics.prod:5432"
          }
        ]
      }
    ]
  },
  {
    id: "rp-2",
    name: "Domain Service Accounts",
    type: RotationPolicyType.DomainWindows,
    status: "active",
    scheduleDays: 60,
    lastRun: "03/01/2026, 03:00 AM",
    nextRun: "04/01/2026, 03:00 AM",
    credentials: { username: "svc_rotator" },
    allowPattern: { accountNames: "svc_*", domainName: "corp.example.com" },
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
        rotatedCount: 0,
        accountErrors: [
          {
            accountName: "svc_backup",
            error:
              "LDAP bind failed: invalid credentials for CN=svc_rotator,OU=Service Accounts,DC=corp,DC=example,DC=com"
          },
          {
            accountName: "svc_monitoring",
            error:
              "LDAP bind failed: invalid credentials for CN=svc_rotator,OU=Service Accounts,DC=corp,DC=example,DC=com"
          },
          {
            accountName: "svc_deploy",
            error: "Account locked out — too many failed password change attempts"
          }
        ]
      }
    ]
  },
  {
    id: "rp-3",
    name: "Local Admin Rotation",
    type: RotationPolicyType.LocalWindows,
    status: "inactive",
    scheduleDays: 14,
    lastRun: "03/10/2026, 01:00 AM",
    nextRun: "-",
    credentials: null,
    allowPattern: { accountNames: "Administrator", resourceNames: "win-srv-*" },
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
