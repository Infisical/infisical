import { useRouterState } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore } from "../fixture-store";
import type { HomeAdapter, HomeApproval, HomeAttention, HomeDay } from "./contract";

const SCENARIOS = ["new", "active", "stressed"] as const;
type HomeScenario = (typeof SCENARIOS)[number];

const useHomeScenario = () =>
  useRouterState({
    select: (state) => {
      const value = (state.location.search as { home?: unknown }).home;
      return SCENARIOS.find((scenario) => scenario === value) ?? "active";
    }
  });

const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const NOW = Date.now();
const DAY = 86_400_000;
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const org = (path: string) => `/organizations/${V4_DEMO_ORG_ID}${path}`;
const pastDays = (values: number[]): HomeDay[] =>
  values.map((value, index) => ({
    date: new Date(NOW - (values.length - 1 - index) * DAY).toISOString(),
    value
  }));
const cumulative = (expiring: number[]): HomeDay[] => {
  let total = 0;
  return Array.from({ length: 31 }, (_, index) => {
    total += expiring.filter((day) => day === index).length;
    return { date: new Date(NOW + index * DAY).toISOString(), value: total };
  });
};

const approval = (
  id: string,
  product: ProjectType,
  subject: string,
  action: string,
  description: string,
  minutes: number,
  extra: Partial<HomeApproval> = {}
): HomeApproval => ({
  id,
  product,
  subject,
  action,
  description,
  createdAt: minutesAgo(minutes),
  href: org("/projects/secret-management/payments-api/approval"),
  target: { kind: "policy", requestId: id, policyType: "demo" },
  ...extra
});

const ACTIVE: HomeApproval[] = [
  approval(
    "a-openai",
    ProjectType.SecretManager,
    "OPENAI_API_KEY",
    " changed in ml-pipeline, production",
    "Jun Park. Needs 1 approval.",
    25
  ),
  approval(
    "a-postgres",
    ProjectType.PAM,
    "prod-postgres",
    " access for 4 hours",
    "Leo Park. Incident 2291. Needs 2 approvals.",
    60,
    { href: org("/pam/approval-requests") }
  )
];

const STRESSED_SUBJECTS = [
  "STRIPE_WEBHOOK_SIGNING_SECRET_FOR_THE_EU_CHECKOUT_FLOW",
  "12 secrets",
  "api.payments.eu-west-1.internal.acme-corporation.example.com",
  "prod-postgres-ledger-core-primary-replica-eu-central",
  "deploy-signer-release-pipeline"
];

const STRESSED: HomeApproval[] = [
  approval(
    "s-break-glass",
    ProjectType.PAM,
    "Break-glass",
    " access to prod-postgres-eu",
    "Leo Park. Incident 2291. Expires in 40 min.",
    4,
    { urgent: true, target: undefined, href: org("/pam/approval-requests") }
  ),
  ...Array.from({ length: 13 }, (_, index) =>
    approval(
      `s-${index}`,
      [
        ProjectType.SecretManager,
        ProjectType.SecretManager,
        ProjectType.CertificateManager,
        ProjectType.PAM,
        ProjectType.CertificateManager
      ][index % 5],
      STRESSED_SUBJECTS[index % 5],
      [
        " changed in platform-core-with-a-very-long-project-name, production-eu-central-1",
        " changed in ledger-core, production",
        " certificate request",
        " access for 8 hours",
        " signing request"
      ][index % 5],
      [
        "Dana Wu-Hernandez. Rotating the EU checkout credentials ahead of the PCI audit window that closes on Friday. Needs 2 approvals.",
        "deploy-bot. Needs 2 approvals.",
        "deploy-bot. Profile web-tls.",
        "Marcus Okafor-Lindqvist. Incident 4410. Needs 1 approval.",
        "release-pipeline. 25 signings."
      ][index % 5],
      12 + index * 53
    )
  )
];

const ATTENTION_STRESSED: HomeAttention[] = [
  {
    id: "t-rotation",
    product: ProjectType.SecretManager,
    title:
      "Rotation **db-credentials-ledger-core-primary** in **platform-core-with-a-very-long-project-name** failed",
    description: "The database rejected the new password. Infisical will retry in 10 minutes.",
    createdAt: minutesAgo(9),
    href: org("/projects/secret-management/platform-core/overview")
  },
  {
    id: "t-relay",
    title: "Relay **relay-us-east-1-production-primary-ingress-cluster-a** is unreachable",
    description: "Gateways edge-us-east-1a, edge-us-east-1b and 14 more depend on this relay.",
    createdAt: minutesAgo(31),
    href: org("/networking")
  },
  {
    id: "t-sync",
    product: ProjectType.CertificateManager,
    title: "Certificate sync **aws-acm-eu-west-1** failed",
    createdAt: minutesAgo(140),
    href: org("/cert-manager/integrations")
  }
];

const queues = createFixtureStore<Record<HomeScenario, HomeApproval[]>>({
  new: [],
  active: ACTIVE,
  stressed: STRESSED
});

export const homeDemo: HomeAdapter = {
  useSecretReads: () => {
    const scenario = useHomeScenario();
    if (scenario === "new") return ok({ total: 0, days: [] });
    const days = pastDays(
      scenario === "stressed"
        ? [41_200, 39_800, 28_400, 27_900, 44_100, 49_300, 50_400]
        : [1510, 1520, 1180, 1170, 1460, 1590, 1600]
    );
    return ok({ total: days.reduce((sum, day) => sum + day.value, 0), days });
  },
  useFindings: () => {
    const scenario = useHomeScenario();
    if (scenario === "new") return ok(null);
    return ok(
      scenario === "stressed"
        ? { findings: 2318, dataSources: 141 }
        : { findings: 3, dataSources: 2 }
    );
  },
  useExpiringCertificates: () => {
    const scenario = useHomeScenario();
    if (scenario === "new") return ok(null);
    const expiring =
      scenario === "stressed"
        ? Array.from({ length: 37 }, (_, index) => Math.floor(index * 0.8))
        : [1, 9, 17, 27];
    return ok({ count: expiring.length, days: cumulative(expiring) });
  },
  useQueue: () => {
    const scenario = useHomeScenario();
    return ok({
      approvals: queues.use()[scenario],
      attention: scenario === "stressed" ? ATTENTION_STRESSED : []
    });
  },
  useApprove: () => {
    const scenario = useHomeScenario();
    return {
      mutateAsync: async (target) =>
        queues.update((current) => ({
          ...current,
          [scenario]: current[scenario].filter(
            (entry) => entry.target?.requestId !== target.requestId
          )
        })),
      isPending: false
    };
  },
  useSetup: () => {
    const scenario = useHomeScenario();
    return ok(
      scenario === "new"
        ? { hasProject: true, hasSecrets: true, hasReads: false, members: 1 }
        : { hasProject: true, hasSecrets: true, hasReads: true, members: 12 }
    );
  }
};
