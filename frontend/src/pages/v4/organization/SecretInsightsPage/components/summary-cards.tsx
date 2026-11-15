import { Grid } from "@infisical/cipher/ui/layout";
import { StatCard } from "@infisical/cipher/ui/stat-card";

import type { TOrgSecretsSummary } from "@app/hooks/api/secretInsights/types";

export const SummaryCards = ({ summary }: { summary?: TOrgSecretsSummary }) => (
  <Grid gap={16} columns={3}>
    <StatCard
      label="Dynamic Secrets in Use"
      icon="clock"
      tone="warn"
      loading={!summary}
      value={summary?.activeLeases.toLocaleString() ?? ""}
      note="Active leases currently issued across all projects"
    />
    <StatCard
      label="Users"
      icon="users"
      tone="info"
      loading={!summary}
      value={summary?.users.toLocaleString() ?? ""}
      note="Members with access to secrets management projects"
    />
    <StatCard
      label="Machine Identities"
      icon="machine"
      tone="info"
      loading={!summary}
      value={summary?.identities.toLocaleString() ?? ""}
      note="Identities with access to secrets management projects"
    />
  </Grid>
);
