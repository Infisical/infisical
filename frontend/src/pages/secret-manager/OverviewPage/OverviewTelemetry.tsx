import { createContext, ReactNode, useContext } from "react";

import { analytics, AnalyticsEvent } from "@app/lib/analytics";
import {
  OverviewCountBucket,
  OverviewFlowProperties,
  OverviewInteractionProperties,
  OverviewScopeProperties
} from "@app/lib/analytics/events";

export const overviewCountBucket = (count: number): OverviewCountBucket => {
  if (count === 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  if (count <= 100) return "21-100";
  return "101+";
};

export const overviewResponsePhase = (
  responseCount: number,
  approvalCount: number,
  failureCount: number
): OverviewFlowProperties["phase"] => {
  if (failureCount) return responseCount + approvalCount ? "partial-response" : "failed";
  if (responseCount) return "response-received";
  if (approvalCount) return "approval-requested";
  return "empty";
};

export type OverviewFlowState = Map<string, "open" | "submitted" | "completed" | "closed">;

export const overviewImportSource = (
  method: "upload" | "paste",
  hasInitialFile: boolean
): "paste" | "drop" | "upload" => {
  if (method === "paste") return "paste";
  return hasInitialFile ? "drop" : "upload";
};

export const createOverviewTelemetry = (
  orgId: string,
  scope: OverviewScopeProperties,
  flows: OverviewFlowState
) => ({
  interaction(properties: OverviewInteractionProperties) {
    analytics.captureForOrganization(AnalyticsEvent.SecretsOverviewInteraction, orgId, {
      ...scope,
      action: properties.action,
      source: properties.source,
      resourceType: properties.resourceType,
      countBucket: properties.countBucket
    });
  },
  flow(properties: OverviewFlowProperties) {
    const key = `${properties.action}:${properties.resourceType}:${properties.source}`;
    if (properties.phase === "canceled") {
      if (flows.get(key) !== "open") return;
      flows.set(key, "closed");
    } else if (properties.phase === "opened") {
      if (flows.get(key) === "open" || flows.get(key) === "submitted") return;
      flows.set(key, "open");
    } else if (properties.phase === "submitted") {
      flows.set(key, "submitted");
    } else if (properties.phase !== "input-received") {
      flows.set(key, "completed");
    }
    analytics.captureForOrganization(AnalyticsEvent.SecretsOverviewFlowProgressed, orgId, {
      ...scope,
      action: properties.action,
      resourceType: properties.resourceType,
      source: properties.source,
      phase: properties.phase,
      countBucket: properties.countBucket,
      approvalCountBucket: properties.approvalCountBucket,
      responseCountBucket: properties.responseCountBucket,
      failureCountBucket: properties.failureCountBucket,
      folderResponseCountBucket: properties.folderResponseCountBucket,
      folderFailureCountBucket: properties.folderFailureCountBucket,
      provenance: properties.provenance,
      destination: properties.destination
    });
  },
  cancelOpenFlows() {
    flows.forEach((state, key) => {
      if (state !== "open") return;
      const [action, resourceType, source] = key.split(":") as [
        OverviewFlowProperties["action"],
        OverviewFlowProperties["resourceType"],
        OverviewFlowProperties["source"]
      ];
      this.flow({ action, resourceType, source, phase: "canceled" });
    });
  }
});

export const observeOverviewRequest = async <T,>(
  telemetry: ReturnType<typeof createOverviewTelemetry>,
  properties: Omit<OverviewFlowProperties, "phase">,
  request: () => Promise<T>
) => {
  telemetry.flow({ ...properties, phase: "submitted" });
  try {
    const result = await request();
    telemetry.flow({
      ...properties,
      phase:
        result && typeof result === "object" && "approval" in result
          ? "approval-requested"
          : "response-received"
    });
    return result;
  } catch (error) {
    telemetry.flow({ ...properties, phase: "failed" });
    throw error;
  }
};

const OverviewTelemetryContext = createContext<ReturnType<typeof createOverviewTelemetry>>({
  interaction: () => {},
  flow: () => {},
  cancelOpenFlows: () => {}
});

export const withOverviewTelemetry = (
  telemetry: ReturnType<typeof createOverviewTelemetry>,
  children: ReactNode
) => (
  <OverviewTelemetryContext.Provider value={telemetry}>
    {children}
  </OverviewTelemetryContext.Provider>
);
export const useOverviewTelemetry = () => useContext(OverviewTelemetryContext);
