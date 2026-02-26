import { Knex } from "knex";

import {
  MetricType,
  ObservabilityItemStatus,
  ObservabilityResourceType,
  ObservabilityWidgetType
} from "../../services/observability-widget/observability-widget-types";
import { TableName } from "../schemas";
import { seedData1 } from "../seed-data";

export async function seed(knex: Knex): Promise<void> {
  // Use the hardcoded seed org if it exists, otherwise fall back to the first org in the DB
  let org = await knex(TableName.Organization).where({ id: seedData1.organization.id }).first();
  if (!org) {
    org = await knex(TableName.Organization).orderBy("createdAt", "asc").first();
  }
  if (!org) throw new Error("No organization found – create one before running this seed");

  await knex(TableName.ObservabilityWidget).where({ orgId: org.id }).del();

  await knex(TableName.ObservabilityWidget).insert([
    // ── Events widgets ─────────────────────────────────────────────────
    {
      name: "Needs Attention",
      description: "Failed and pending resources across the organization",
      orgId: org.id,
      type: ObservabilityWidgetType.Events,
      config: JSON.stringify({
        resourceTypes: [],
        eventTypes: ["failed", "pending"],
        thresholds: { expirationDays: 7 }
      }),
      refreshInterval: 30,
      icon: "alert-triangle",
      color: "#ef4444"
    },
    {
      name: "Expiring Tokens & Certs",
      description: "Machine identity tokens and PKI certificates expiring soon",
      orgId: org.id,
      type: ObservabilityWidgetType.Events,
      config: JSON.stringify({
        resourceTypes: [
          ObservabilityResourceType.MachineIdentityToken,
          ObservabilityResourceType.PkiCertificate
        ],
        eventTypes: ["expired", "active"],
        thresholds: { expirationDays: 30 }
      }),
      refreshInterval: 60,
      icon: "clock",
      color: "#f59e0b"
    },
    {
      name: "Secret Sync Status",
      description: "Status of all secret sync jobs",
      orgId: org.id,
      type: ObservabilityWidgetType.Events,
      config: JSON.stringify({
        resourceTypes: [ObservabilityResourceType.SecretSync],
        eventTypes: ["failed", "pending", "active"],
        thresholds: {}
      }),
      refreshInterval: 30,
      icon: "refresh-cw",
      color: "#3b82f6"
    },

    // ── Metrics widgets ────────────────────────────────────────────────
    {
      name: "Failed Resources",
      description: "Total number of resources currently in a failed state",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.StatusCount,
        status: ObservabilityItemStatus.Failed
      }),
      refreshInterval: 30,
      icon: "x-circle",
      color: "#ef4444"
    },
    {
      name: "Expiring in 7 Days",
      description: "Resources expiring within the next 7 days",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.ExpiringSoon,
        thresholdDays: 7
      }),
      refreshInterval: 60,
      icon: "timer",
      color: "#f59e0b"
    },
    {
      name: "Machine Identities",
      description: "Total active machine identities in the organization",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.IdentityCount,
        identityType: "machine"
      }),
      refreshInterval: 120,
      icon: "bot",
      color: "#8b5cf6"
    },
    {
      name: "Active Users",
      description: "Total active users in the organization",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.IdentityCount,
        identityType: "user"
      }),
      refreshInterval: 120,
      icon: "users",
      color: "#10b981"
    },

    // ── Live Logs widget ───────────────────────────────────────────────
    {
      name: "Live Audit Logs",
      description: "Real-time audit log stream across the organization",
      orgId: org.id,
      type: ObservabilityWidgetType.Logs,
      config: JSON.stringify({ limit: 300 }),
      refreshInterval: 5,
      icon: "activity",
      color: "#3b82f6"
    }
  ]);
}
