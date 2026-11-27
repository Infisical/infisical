import { useEffect, useId, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Grid, Stack } from "@infisical/cipher/ui/layout";

import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type {
  TOrgAuthMethodUsage,
  TOrgProjectInsight,
  TOrgProjectsInsights,
  TOrgSecretAccessVolume,
  TOrgSecretsSummary,
  TOrgStaticSecretUsage
} from "@app/hooks/api/secretInsights/types";

import { AccessVolumeCard } from "./access-volume-card";
import { AuthMethodsCard } from "./auth-methods-card";
import { NewSecretsCard } from "./new-secrets-card";
import { ProjectsInsightsCard } from "./projects-insights-card";
import { SummaryCards } from "./summary-cards";

import styles from "./insights-upgrade-preview.module.css";

const DAY_MS = 24 * 60 * 60 * 1000;

const SAMPLE_SUMMARY: TOrgSecretsSummary = { activeLeases: 42, users: 128, identities: 57 };

const sampleProject = (
  index: number,
  projectName: string,
  severityScore: number,
  warnings: Partial<TOrgProjectInsight["warnings"]>
): TOrgProjectInsight => ({
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

const daysAgo = (now: number, days: number) =>
  new Date(now - days * DAY_MS).toISOString().slice(0, 10);

const buildSampleData = () => {
  const now = Date.now();
  const staticSecrets: TOrgStaticSecretUsage = {
    weeks: SAMPLE_WEEKLY_SECRETS.map((totalSecrets, index) => ({
      weekStart: daysAgo(now, (SAMPLE_WEEKLY_SECRETS.length - 1 - index) * 7),
      totalSecrets,
      isPartial: index === SAMPLE_WEEKLY_SECRETS.length - 1
    }))
  };
  const accessVolume: TOrgSecretAccessVolume = {
    days: SAMPLE_DAILY_READS.map((total, index) => ({
      date: daysAgo(now, SAMPLE_DAILY_READS.length - 1 - index),
      total
    }))
  };
  return { staticSecrets, accessVolume };
};

// The backdrop is the real Insights cards on sample data, blurred and inert, so nothing is
// requested from the gated endpoints.
export const InsightsUpgradePreview = ({ onUpgrade }: { onUpgrade: () => void }) => {
  const titleId = useId();
  const [sample] = useState(buildSampleData);

  // The upgrade gate refreshes the cached subscription when it mounts on a billing return, so it
  // opens on its own then; otherwise the page would keep showing this preview after an upgrade.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("checkout") === "success" || search.get("card") === "setup_success") {
      onUpgrade();
    }
  }, [onUpgrade]);

  return (
    <div className={styles.preview}>
      <div aria-hidden inert className={styles.backdrop}>
        <Stack gap={16}>
          <SummaryCards summary={SAMPLE_SUMMARY} />
          <ProjectsInsightsCard
            data={SAMPLE_PROJECTS}
            hasMore={false}
            onLoadMore={() => undefined}
            isLoadingMore={false}
          />
          <Grid gap={16} columns={2}>
            <AuthMethodsCard data={SAMPLE_AUTH_METHODS} />
            <NewSecretsCard data={sample.staticSecrets} />
          </Grid>
          <AccessVolumeCard data={sample.accessVolume} />
        </Stack>
      </div>
      <div className={styles.prompt}>
        <section aria-labelledby={titleId} className={styles.promptCard}>
          <Card>
            <span id={titleId} hidden>
              Insights Is Not Included in Your Current Plan
            </span>
            <EmptyState
              icon="lock"
              title="Insights Is Not Included in Your Current Plan"
              description="Upgrade to see secret health, access volume, and authentication trends across your projects."
              actions={
                <Button variant="primary" onClick={onUpgrade}>
                  Upgrade Plan
                </Button>
              }
            />
          </Card>
        </section>
      </div>
    </div>
  );
};
