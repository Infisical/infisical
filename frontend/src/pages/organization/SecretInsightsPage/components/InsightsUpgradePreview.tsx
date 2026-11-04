import { useEffect, useId } from "react";
import { LockIcon } from "lucide-react";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@app/components/v3";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import {
  TOrgAuthMethodUsage,
  TOrgProjectsInsights,
  TOrgSecretAccessVolume,
  TOrgSecretsSummary,
  TOrgStaticSecretUsage
} from "@app/hooks/api/secretInsights/types";

import { AuthMethodsCard } from "./AuthMethodsCard";
import { InsightsCard } from "./InsightsCard";
import { SecretAccessVolumeCard } from "./SecretAccessVolumeCard";
import { StaticSecretPresenceCard } from "./StaticSecretPresenceCard";
import { SummaryCard } from "./SummaryCard";

const DAY_MS = 24 * 60 * 60 * 1000;

const SAMPLE_SUMMARY: TOrgSecretsSummary = { activeLeases: 42, users: 128, identities: 57 };

const sampleProject = (
  index: number,
  projectName: string,
  severityScore: number,
  warnings: Partial<TOrgProjectsInsights["projects"][number]["warnings"]>
) => ({
  projectId: `sample-project-${index}`,
  projectName,
  projectSlug: projectName.toLowerCase().replace(/\s+/g, "-"),
  totalSecrets: 120 + index * 37,
  severityScore,
  warnings: {
    duplicatedSecrets: 0,
    staleSecrets: 0,
    failedRotations: 0,
    failedSyncs: 0,
    orphanedLeases: 0,
    ...warnings
  }
});

const SAMPLE_PROJECTS: TOrgProjectsInsights = {
  projects: [
    sampleProject(1, "Payments API", 9, { failedRotations: 2, staleSecrets: 14 }),
    sampleProject(2, "Checkout Web", 7, { failedSyncs: 3, duplicatedSecrets: 6 }),
    sampleProject(3, "Data Pipeline", 5, { staleSecrets: 21 }),
    sampleProject(4, "Mobile Backend", 3, { duplicatedSecrets: 4, orphanedLeases: 1 }),
    sampleProject(5, "Internal Tools", 2, { staleSecrets: 5 })
  ],
  totalProjects: 18,
  projectsWithIssues: 5,
  offset: 0,
  limit: 100
};

const SAMPLE_AUTH_METHODS: TOrgAuthMethodUsage = {
  totalFetches: 48210,
  methods: [
    { authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, count: 21450 },
    { authMethod: IdentityAuthMethod.KUBERNETES_AUTH, count: 14320 },
    { authMethod: IdentityAuthMethod.AWS_AUTH, count: 8240 },
    { authMethod: IdentityAuthMethod.OIDC_AUTH, count: 4200 }
  ]
};

const SAMPLE_WEEKLY_SECRETS = [34, 41, 28, 52, 47, 63, 38, 55, 71, 49, 66, 24];
const SAMPLE_DAILY_READS = [3120, 3480, 2910, 4020, 4410, 2380, 2150];

const buildSampleData = () => {
  const now = Date.now();
  const staticSecretUsage: TOrgStaticSecretUsage = {
    weeks: SAMPLE_WEEKLY_SECRETS.map((totalSecrets, index) => ({
      weekStart: new Date(now - (SAMPLE_WEEKLY_SECRETS.length - 1 - index) * 7 * DAY_MS)
        .toISOString()
        .slice(0, 10),
      totalSecrets,
      isPartial: index === SAMPLE_WEEKLY_SECRETS.length - 1
    }))
  };
  const accessVolume: TOrgSecretAccessVolume = {
    days: SAMPLE_DAILY_READS.map((total, index) => ({
      date: new Date(now - (SAMPLE_DAILY_READS.length - 1 - index) * DAY_MS)
        .toISOString()
        .slice(0, 10),
      total
    }))
  };
  return { staticSecretUsage, accessVolume };
};

type Props = {
  onUpgrade: () => void;
};

// Shown in place of Insights when the plan lacks the entitlement. The backdrop is the real
// Insights cards fed sample data, blurred and made inert, so the viewer sees what they would get
// without any request being made against the gated endpoints.
export const InsightsUpgradePreview = ({ onUpgrade }: Props) => {
  const titleId = useId();
  const { staticSecretUsage, accessVolume } = buildSampleData();

  // The upgrade gate refreshes the cached subscription when it mounts on a billing return, so open
  // it automatically then; otherwise the page would keep showing this preview after an upgrade.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("checkout") === "success" || search.get("card") === "setup_success") {
      onUpgrade();
    }
  }, [onUpgrade]);

  return (
    <div className="grid w-full pb-8">
      <div
        aria-hidden
        inert
        className="pointer-events-none col-start-1 row-start-1 flex flex-col gap-4 [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)] blur-[3px] select-none"
      >
        <SummaryCard summary={SAMPLE_SUMMARY} />
        <InsightsCard
          data={SAMPLE_PROJECTS}
          hasMore={false}
          onLoadMore={() => {}}
          isLoadingMore={false}
        />
        <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
          <AuthMethodsCard data={SAMPLE_AUTH_METHODS} />
          <StaticSecretPresenceCard data={staticSecretUsage} />
        </div>
        <SecretAccessVolumeCard data={accessVolume} />
      </div>
      <div className="relative col-start-1 row-start-1 flex items-start justify-center p-4 pt-40">
        <section
          aria-labelledby={titleId}
          className="w-full max-w-lg animate-in rounded-lg border border-border bg-popover p-8 shadow-lg duration-200 fade-in-0 zoom-in-95"
        >
          <Empty variant="unstyled">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LockIcon />
              </EmptyMedia>
              <EmptyTitle id={titleId}>Insights Is Not Included in Your Current Plan</EmptyTitle>
              <EmptyDescription>
                Upgrade to see secret health, access volume, and authentication trends across your
                projects.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="project" onClick={onUpgrade}>
                Upgrade Plan
              </Button>
            </EmptyContent>
          </Empty>
        </section>
      </div>
    </div>
  );
};
