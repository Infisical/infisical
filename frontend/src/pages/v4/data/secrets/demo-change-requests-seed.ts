import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import type { ProjectEnv } from "@app/hooks/api/projects/types";
import {
  ApprovalStatus,
  CommitType,
  type TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import { ReservedFolders } from "@app/hooks/api/secretFolders/types";
import type { SecretV3Raw } from "@app/hooks/api/secrets/types";
import type { WsTag } from "@app/hooks/api/tags/types";

type Request = TSecretApprovalRequest;
type Policy = Request["policy"];
type Commit = Request["commits"][number];
type Reviewer = Request["reviewers"][number];
type Person = NonNullable<Request["committerUser"]>;

const PROJECT = "payments-api";

const person = (id: string, firstName: string, lastName: string): Person => ({
  userId: `u-${id}`,
  email: `${id}@acme.dev`,
  firstName,
  lastName,
  username: `${id}@acme.dev`
});

export const CHANGE_REQUEST_SELF = person("sarah", "Sarah", "Lin");
const marcus = person("marcus", "Marcus", "Webb");
const priya = person("priya", "Priya", "Raman");
const diego = person("diego", "Diego", "Alvarez");
const tom = person("tom", "Tom", "Becker");

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();

const approver = (user: Person, isOrgMembershipActive = true) => ({
  ...user,
  isOrgMembershipActive
});

const policy = (
  id: string,
  name: string,
  environment: ProjectEnv,
  extra: Partial<Policy>
): Policy => ({
  id: `policy-${id}`,
  project: PROJECT,
  name,
  environments: [environment],
  secretPath: "/",
  approvals: 1,
  updatedAt: new Date(hoursAgo(24 * 30)),
  enforcementLevel: EnforcementLevel.Hard,
  allowedSelfApprovals: false,
  bypassForMachineIdentities: false,
  approvers: [approver(CHANGE_REQUEST_SELF), approver(marcus)],
  bypassers: [],
  ...extra
});

const review = (
  user: Person,
  status: ApprovalStatus,
  hours: number,
  comment = "",
  isOrgMembershipActive = true
): Reviewer => ({
  ...user,
  status,
  comment,
  isOrgMembershipActive,
  createdAt: new Date(hoursAgo(hours))
});

const tag = (slug: string): WsTag => ({
  id: `tag-${slug}`,
  slug,
  projectId: PROJECT,
  createdAt: hoursAgo(24 * 60),
  updatedAt: hoursAgo(24 * 60),
  __v: 0
});

type SecretState = {
  value?: string;
  comment?: string;
  tags?: WsTag[];
  metadata?: { key: string; value: string; isEncrypted?: boolean }[];
};

type Change = {
  op: CommitType;
  key: string;
  before?: SecretState & { version?: number };
  after?: SecretState;
  current?: number;
};

const commitsOf = (slug: string, environment: string, path: string, changes: Change[]) =>
  changes.map((change, index): Commit => {
    const commitId = `request-${slug}-commit-${index + 1}`;
    const before = change.before ?? {};
    const after = change.op === CommitType.DELETE ? {} : (change.after ?? before);
    const secretVersion: SecretV3Raw = {
      id: `request-${slug}-version-${index + 1}`,
      _id: `request-${slug}-version-${index + 1}`,
      project: PROJECT,
      environment,
      version: before.version ?? 1,
      type: "shared",
      secretValueHidden: false,
      secretKey: change.key,
      secretPath: path,
      secretValue: before.value,
      secretComment: before.comment,
      tags: before.tags,
      secretMetadata: before.metadata,
      createdAt: hoursAgo(24 * 10),
      updatedAt: hoursAgo(24 * 10)
    };
    return {
      id: commitId,
      op: change.op,
      secretKey: change.key,
      secretValue: after.value,
      secretComment: after.comment,
      tags: after.tags,
      secretMetadata: after.metadata,
      algorithm: "aes-256-gcm",
      keyEncoding: "utf8",
      version: before.version ?? 1,
      secret:
        change.op === CommitType.CREATE
          ? undefined
          : { version: change.current ?? before.version ?? 1 },
      secretVersion
    };
  });

const environments = {
  dev: { id: "env-dev", name: "Development", slug: "dev" },
  staging: { id: "env-staging", name: "Staging", slug: "staging" },
  prod: { id: "env-prod", name: "Production", slug: "prod" }
};

const production = policy("production", "Production changes", environments.prod, {});
const paymentsApi = policy("payments-api", "Payments API review", environments.prod, {
  secretPath: "/api",
  approvals: 2,
  approvers: [approver(CHANGE_REQUEST_SELF), approver(marcus), approver(tom, false)]
});
const staging = policy("staging", "Staging changes", environments.staging, {
  enforcementLevel: EnforcementLevel.Soft,
  allowedSelfApprovals: true,
  approvers: [approver(marcus)]
});
const development = policy("development", "Development imports", environments.dev, {});

const replicationImportId = [PROJECT, "dev", "/", "import", "prod", "/api"].join(":");

const request = (
  slug: string,
  options: {
    policy: Policy;
    committer: Person | { identityId: string; name: string };
    hours: number;
    environment: keyof typeof environments;
    path?: string;
    changes: Change[];
  } & Partial<Request>
): Request => {
  const {
    policy: requestPolicy,
    committer,
    hours,
    environment,
    path = "/",
    changes,
    ...rest
  } = options;
  const isIdentity = "identityId" in committer;
  return {
    id: `request-${slug}`,
    slug,
    createdAt: hoursAgo(hours),
    updatedAt: hoursAgo(hours),
    committerUserId: isIdentity ? "" : committer.userId,
    reviewers: [],
    project: PROJECT,
    environment,
    folderId: [PROJECT, environment, path].join(":"),
    secretPath: path,
    hasMerged: false,
    status: "open",
    policy: requestPolicy,
    statusChangedByUserId: "",
    committerUser: isIdentity ? null : committer,
    committerIdentity: isIdentity ? committer : null,
    conflicts: [],
    commits: commitsOf(slug, environment, path, changes),
    ...rest
  };
};

const config = tag("config");
const billing = tag("billing");

export const seedChangeRequests = (): Request[] => [
  request("smtp", {
    policy: production,
    committer: priya,
    hours: 1,
    environment: "prod",
    changes: [
      {
        op: CommitType.DELETE,
        key: "SMTP_PASSWORD",
        before: { value: "fake-smtp-password", comment: "Legacy relay, replaced by SES." }
      }
    ]
  }),
  request("api-tuning", {
    policy: paymentsApi,
    committer: diego,
    hours: 4,
    environment: "prod",
    path: "/api",
    commitMessage: "Tune the API for the holiday traffic peak.",
    reviewers: [
      review(CHANGE_REQUEST_SELF, ApprovalStatus.APPROVED, 2, "Matches the load test plan.")
    ],
    changes: [
      {
        op: CommitType.UPDATE,
        key: "RATE_LIMIT_PER_MIN",
        before: { value: "600", comment: "Applies per API key.", version: 4 },
        after: { value: "1200", comment: "Applies per API key. Raised for peak season." }
      },
      {
        op: CommitType.UPDATE,
        key: "CORS_ORIGINS",
        before: {
          value: "https://app.example.test\nhttps://admin.example.test",
          version: 2
        },
        after: {
          value:
            "https://app.example.test\nhttps://admin.example.test\nhttps://checkout.example.test"
        }
      }
    ]
  }),
  request("webhook", {
    policy: production,
    committer: marcus,
    hours: 7,
    environment: "prod",
    reviewers: [review(CHANGE_REQUEST_SELF, ApprovalStatus.APPROVED, 5)],
    changes: [
      {
        op: CommitType.CREATE,
        key: "STRIPE_WEBHOOK_SECRET",
        after: {
          value: "fake-stripe-webhook-secret",
          comment: "Signing secret for the checkout webhook.",
          tags: [billing],
          metadata: [{ key: "owner", value: "payments-platform" }]
        }
      }
    ]
  }),
  request("flags", {
    policy: staging,
    committer: CHANGE_REQUEST_SELF,
    hours: 10,
    environment: "staging",
    changes: [
      {
        op: CommitType.UPDATE,
        key: "FEATURE_FLAGS",
        before: {
          value: "checkout_v2=false",
          tags: [config],
          metadata: [{ key: "owner", value: "web" }],
          version: 6
        },
        after: {
          value: "checkout_v2=true",
          comment: "Enable the new checkout for staging QA.",
          tags: [config, billing],
          metadata: [
            { key: "owner", value: "payments-platform" },
            { key: "ticket", value: "PAY-2207" }
          ]
        }
      }
    ]
  }),
  request("ci-rotate", {
    policy: production,
    committer: { identityId: "identity-ci-deployer", name: "ci-deployer" },
    hours: 26,
    environment: "prod",
    commitMessage: "Rotate the Stripe key after the vendor notice.",
    reviewers: [
      review(
        marcus,
        ApprovalStatus.REJECTED,
        20,
        "Rotate this through the secret rotation instead."
      )
    ],
    changes: [
      {
        op: CommitType.UPDATE,
        key: "STRIPE_SECRET_KEY",
        before: { value: "fake-stripe-key-v2", version: 2 },
        after: { value: "fake-stripe-key-v3" },
        current: 3
      }
    ]
  }),
  request("replicated", {
    policy: development,
    committer: tom,
    hours: 30,
    environment: "dev",
    path: `/${ReservedFolders.SecretReplication}${replicationImportId}`,
    isReplicated: true,
    changes: [
      { op: CommitType.CREATE, key: "FRAUD_SCORE_THRESHOLD", after: { value: "0.82" } },
      { op: CommitType.CREATE, key: "LEDGER_DB_USERNAME", after: { value: "fake-ledger-user" } }
    ]
  }),
  request("rotate-jwt", {
    policy: production,
    committer: tom,
    hours: 50,
    environment: "prod",
    status: "close",
    hasMerged: true,
    updatedAt: hoursAgo(48),
    statusChangedByUserId: CHANGE_REQUEST_SELF.userId,
    statusChangedByUser: CHANGE_REQUEST_SELF,
    reviewers: [review(CHANGE_REQUEST_SELF, ApprovalStatus.APPROVED, 48)],
    changes: [
      {
        op: CommitType.UPDATE,
        key: "JWT_SIGNING_KEY",
        before: { value: "fake-jwt-key-v1" },
        after: { value: "fake-jwt-key-v2" }
      }
    ]
  }),
  request("hotfix", {
    policy: staging,
    committer: diego,
    hours: 74,
    environment: "staging",
    status: "close",
    hasMerged: true,
    updatedAt: hoursAgo(73),
    bypassReason: "Hotfix for the checkout outage, reviewed in the incident channel.",
    statusChangedByUserId: diego.userId,
    statusChangedByUser: diego,
    changes: [
      {
        op: CommitType.UPDATE,
        key: "PAYMENT_PROVIDER",
        before: { value: "stripe" },
        after: { value: "stripe-fallback" }
      }
    ]
  }),
  request("legacy-keys", {
    policy: production,
    committer: priya,
    hours: 120,
    environment: "prod",
    status: "close",
    updatedAt: hoursAgo(118),
    statusChangedByUserId: CHANGE_REQUEST_SELF.userId,
    statusChangedByUser: CHANGE_REQUEST_SELF,
    reviewers: [
      review(CHANGE_REQUEST_SELF, ApprovalStatus.REJECTED, 118, "The honey tokens must stay.")
    ],
    changes: [
      {
        op: CommitType.DELETE,
        key: "AWS_ACCESS_KEY_ID_LEGACY",
        before: { value: "fake-legacy-key-id" }
      },
      {
        op: CommitType.DELETE,
        key: "AWS_SECRET_ACCESS_KEY_LEGACY",
        before: { value: "fake-legacy-secret" }
      }
    ]
  }),
  {
    ...request("sentry", {
      policy: production,
      committer: priya,
      hours: 200,
      environment: "prod",
      status: "close",
      hasMerged: true,
      updatedAt: hoursAgo(190),
      statusChangedByUserId: marcus.userId,
      statusChangedByUser: marcus,
      reviewers: [review(marcus, ApprovalStatus.APPROVED, 190)],
      changes: [
        {
          op: CommitType.UPDATE,
          key: "SENTRY_DSN",
          before: { value: "https://fake@sentry.example.test/1" },
          after: { value: "https://fake@sentry.example.test/2" }
        }
      ]
    }),
    conflicts: [{ secretId: "request-sentry-commit-1", op: CommitType.UPDATE }]
  }
];
