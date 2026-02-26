import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

interface BuiltInWidgetDef {
  name: string;
  description: string;
  type: "events" | "logs";
  config: object;
  refreshInterval: number;
  icon: string;
  color: string;
  layoutTmpl: string;
}

const BUILT_IN_WIDGETS: BuiltInWidgetDef[] = [
  {
    name: "All Failures",
    description: "Monitor all failed resources across the organization",
    type: "events",
    config: {
      resourceTypes: [],
      eventTypes: ["failed"]
    },
    refreshInterval: 30,
    icon: "Activity",
    color: "#1c2a3a",
    layoutTmpl: "all-failures"
  },
  {
    name: "Expiring Certificates",
    description: "Certificates expiring within 30 days",
    type: "events",
    config: {
      resourceTypes: ["pki-certificate"],
      eventTypes: ["expired", "pending"],
      thresholds: {
        expirationDays: 30
      }
    },
    refreshInterval: 30,
    icon: "Clock",
    color: "#1c2a3a",
    layoutTmpl: "expiring-certs"
  },
  {
    name: "Secret Syncs Monitor",
    description: "Monitor secret sync and rotation failures",
    type: "events",
    config: {
      resourceTypes: ["secret-sync", "secret-rotation"],
      eventTypes: ["failed", "pending", "active", "expired"]
    },
    refreshInterval: 30,
    icon: "RefreshCw",
    color: "#f97316",
    layoutTmpl: "secret-syncs"
  }
];

export async function up(knex: Knex): Promise<void> {
  const hasIsBuiltInColumn = await knex.schema.hasColumn(TableName.ObservabilityWidget, "isBuiltIn");
  if (!hasIsBuiltInColumn) {
    await knex.schema.alterTable(TableName.ObservabilityWidget, (t) => {
      t.boolean("isBuiltIn").notNullable().defaultTo(false);
    });
  }

  const organizations = await knex(TableName.Organization).select("id");

  for (const org of organizations) {
    const widgetIdMap: Record<string, string> = {};

    for (const widgetDef of BUILT_IN_WIDGETS) {
      const existingWidget = await knex(TableName.ObservabilityWidget)
        .where({
          orgId: org.id,
          name: widgetDef.name,
          isBuiltIn: true
        })
        .first();

      if (existingWidget) {
        widgetIdMap[widgetDef.layoutTmpl] = existingWidget.id;
      } else {
        const [inserted] = await knex(TableName.ObservabilityWidget)
          .insert({
            name: widgetDef.name,
            description: widgetDef.description,
            orgId: org.id,
            type: widgetDef.type,
            config: JSON.stringify(widgetDef.config),
            refreshInterval: widgetDef.refreshInterval,
            icon: widgetDef.icon,
            color: widgetDef.color,
            isBuiltIn: true
          })
          .returning("id");

        widgetIdMap[widgetDef.layoutTmpl] = inserted.id;
      }
    }

    const logsWidget = await knex(TableName.ObservabilityWidget)
      .where({
        orgId: org.id,
        type: "logs",
        isBuiltIn: true
      })
      .first();

    let logsWidgetId = logsWidget?.id;
    if (!logsWidgetId) {
      const [insertedLogs] = await knex(TableName.ObservabilityWidget)
        .insert({
          name: "Live Logs",
          description: "Real-time org-wide activity stream",
          orgId: org.id,
          type: "logs",
          config: JSON.stringify({ limit: 300 }),
          refreshInterval: 5,
          icon: "Terminal",
          color: "#1c2a3a",
          isBuiltIn: true
        })
        .returning("id");
      logsWidgetId = insertedLogs.id;
    }
    widgetIdMap["logs"] = logsWidgetId;

    const defaultView = await knex(TableName.ObservabilityWidgetView)
      .where({
        orgId: org.id,
        isDefault: true
      })
      .first();

    if (defaultView) {
      // Merge widgetIds into the existing layout by UID rather than replacing the
      // entire layout, so that additional slots (e.g. metrics rows) are preserved.
      const uidToWidgetId: Record<string, string> = {
        "default-all-failures": widgetIdMap["all-failures"],
        "default-secret-syncs": widgetIdMap["secret-syncs"],
        "default-live-logs": widgetIdMap["logs"]
      };

      let existingItems: Record<string, unknown>[] = [];
      try {
        existingItems = JSON.parse(defaultView.items || "[]");
      } catch {
        existingItems = [];
      }

      const mergedItems = existingItems.map((item) => {
        const wid = uidToWidgetId[(item as { uid: string }).uid];
        return wid ? { ...item, widgetId: wid } : item;
      });

      await knex(TableName.ObservabilityWidgetView)
        .where({ id: defaultView.id })
        .update({ items: JSON.stringify(mergedItems) });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex(TableName.ObservabilityWidget).where({ isBuiltIn: true }).del();

  const hasIsBuiltInColumn = await knex.schema.hasColumn(TableName.ObservabilityWidget, "isBuiltIn");
  if (hasIsBuiltInColumn) {
    await knex.schema.alterTable(TableName.ObservabilityWidget, (t) => {
      t.dropColumn("isBuiltIn");
    });
  }
}
