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

type OverviewFlowLifecycle = {
  status: "open" | "submitted" | "completed" | "closed";
  cancelOnScopeChange?: boolean;
};
export type OverviewFlowState = Map<string, OverviewFlowLifecycle>;
export type OverviewFlowHandle = {
  flow: (properties: Omit<OverviewFlowProperties, "action" | "resourceType" | "source">) => void;
  isCurrent: () => boolean;
};

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
  flow(properties: OverviewFlowProperties, lifecycle?: OverviewFlowLifecycle) {
    const key = `${properties.action}:${properties.resourceType}:${properties.source}`;
    let state: OverviewFlowLifecycle = lifecycle ?? flows.get(key) ?? { status: "closed" };
    if (!lifecycle && properties.phase === "opened" && state.status === "submitted")
      state = { status: "closed" };
    if (properties.phase === "canceled") {
      if (state.status !== "open") return;
      state.status = "closed";
    } else if (properties.phase === "opened") {
      if (state.status === "open" || state.status === "submitted") return;
      state.status = "open";
      flows.set(key, state);
    } else if (properties.phase === "submitted") {
      state.status = "submitted";
      flows.set(key, state);
    } else if (properties.phase !== "input-received") {
      state.status = "completed";
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
      destination: properties.destination,
      commitKind: properties.commitKind
    });
  },
  openFlow(
    properties: Omit<OverviewFlowProperties, "phase">,
    options?: { cancelOnScopeChange: boolean }
  ): OverviewFlowHandle {
    const key = `${properties.action}:${properties.resourceType}:${properties.source}`;
    const state: OverviewFlowLifecycle = {
      status: "closed",
      cancelOnScopeChange: options?.cancelOnScopeChange
    };
    this.flow({ ...properties, phase: "opened" }, state);
    return {
      flow: (progress) => this.flow({ ...properties, ...progress }, state),
      isCurrent: () => flows.get(key) === state
    };
  },
  startFlow(properties: Omit<OverviewFlowProperties, "phase">): OverviewFlowHandle {
    const key = `${properties.action}:${properties.resourceType}:${properties.source}`;
    const current = flows.get(key);
    const state: OverviewFlowLifecycle =
      current?.status === "open" ? current : { status: "submitted" };
    this.flow({ ...properties, phase: "submitted" }, state);
    return {
      flow: (progress) => this.flow({ ...properties, ...progress }, state),
      isCurrent: () => flows.get(key) === state
    };
  },
  cancelOpenFlows() {
    flows.forEach((state, key) => {
      if (state.cancelOnScopeChange === false) return;
      if (state.status !== "open") {
        flows.delete(key);
        return;
      }
      const [action, resourceType, source] = key.split(":") as [
        OverviewFlowProperties["action"],
        OverviewFlowProperties["resourceType"],
        OverviewFlowProperties["source"]
      ];
      this.flow({ action, resourceType, source, phase: "canceled" }, state);
      flows.delete(key);
    });
  }
});

export const observeOverviewRequest = async <T,>(
  telemetry: ReturnType<typeof createOverviewTelemetry>,
  properties: Omit<OverviewFlowProperties, "phase">,
  request: () => Promise<T>
) => {
  const attempt = telemetry.startFlow(properties);
  try {
    const result = await request();
    attempt.flow({
      phase:
        result && typeof result === "object" && "approval" in result
          ? "approval-requested"
          : "response-received"
    });
    return result;
  } catch (error) {
    attempt.flow({ phase: "failed" });
    throw error;
  }
};

const OverviewTelemetryContext = createContext<ReturnType<typeof createOverviewTelemetry>>({
  interaction: () => {},
  flow: () => {},
  openFlow: () => ({ flow: () => {}, isCurrent: () => true }),
  startFlow: () => ({ flow: () => {}, isCurrent: () => true }),
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
