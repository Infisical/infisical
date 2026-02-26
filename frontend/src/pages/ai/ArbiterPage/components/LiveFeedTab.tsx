import { useEffect, useMemo, useRef, useState } from "react";
import { Radio } from "lucide-react";

import {
  Badge,
  DocumentationLinkBadge,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useQueryAgentGateAuditLogs } from "@app/hooks/api";
import { TAgentGateAuditLog } from "@app/hooks/api/agentGate/types";

import type { DemoEvent } from "../data";
import { AuditLogPanel } from "./AuditLogPanel";
import { ConstellationView } from "./ConstellationView";

const mapAuditLogToEvent = (log: TAgentGateAuditLog): DemoEvent => ({
  id: log.id,
  agentId: log.requestingAgentId,
  targetAgentId: log.targetAgentId || undefined,
  action: log.action,
  details: `${log.actionType}: ${log.action}`,
  status: log.result === "allowed" ? "approved" : "denied",
  reasoning: log.policyEvaluations?.[0]?.reasoning ?? "",
  agentReasoning: log.agentReasoning || undefined,
  executionStatus: log.executionStatus,
  timestamp: log.timestamp
});

export const LiveFeedTab = () => {
  const { currentProject } = useProject();
  const projectId = currentProject.id;

  // Capture mount time so we only show events that arrive after page load
  const [mountTime] = useState(() => new Date().toISOString());
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);

  // Unfiltered query to detect new sessions
  const { data: unfilteredData } = useQueryAgentGateAuditLogs({
    projectId,
    limit: 1,
    startTime: mountTime
  });

  // Session-filtered query for the active session's events
  const { data: auditData } = useQueryAgentGateAuditLogs({
    projectId,
    limit: 50,
    startTime: mountTime,
    sessionId: activeSessionId
  });

  const previousLatestIdRef = useRef<string | null>(null);
  const activeSinceRef = useRef<number>(0);
  const deactivateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentEvent, setCurrentEvent] = useState<DemoEvent | null>(null);

  const events: DemoEvent[] = useMemo(() => {
    if (!auditData?.logs?.length) return [];
    return auditData.logs.map(mapAuditLogToEvent);
  }, [auditData?.logs]);

  // Switch to the latest session whenever a new one appears
  useEffect(() => {
    if (!unfilteredData?.logs?.length) return;
    const latestSession = unfilteredData.logs[0]?.sessionId;
    if (latestSession && latestSession !== activeSessionId) {
      setActiveSessionId(latestSession);
      previousLatestIdRef.current = null;
      setCurrentEvent(null);
      if (deactivateTimerRef.current) {
        clearTimeout(deactivateTimerRef.current);
        deactivateTimerRef.current = null;
      }
    }
  }, [unfilteredData?.logs]);

  // Highlight the latest event — active while executionStatus is null, pending, or started
  // Stays active for a minimum of 5 seconds
  const isActiveStatus = (status: DemoEvent["executionStatus"]) =>
    status == null || status === "pending" || status === "started";

  const MIN_ACTIVE_MS = 20000;

  const scheduleDeactivate = () => {
    if (deactivateTimerRef.current) return;
    const elapsed = Date.now() - activeSinceRef.current;
    const remaining = Math.max(0, MIN_ACTIVE_MS - elapsed);
    deactivateTimerRef.current = setTimeout(() => {
      deactivateTimerRef.current = null;
      setCurrentEvent(null);
    }, remaining);
  };

  useEffect(() => {
    return () => {
      if (deactivateTimerRef.current) clearTimeout(deactivateTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!events.length) return;
    const latest = events[0];
    if (latest.id !== previousLatestIdRef.current) {
      // New event arrived — always activate it with minimum time guarantee
      previousLatestIdRef.current = latest.id;
      if (deactivateTimerRef.current) {
        clearTimeout(deactivateTimerRef.current);
        deactivateTimerRef.current = null;
      }
      activeSinceRef.current = Date.now();
      setCurrentEvent(latest);
      if (!isActiveStatus(latest.executionStatus)) {
        // Already completed/failed — schedule deactivation after minimum time
        scheduleDeactivate();
      }
    } else if (currentEvent && !isActiveStatus(latest.executionStatus)) {
      // Status changed on the current event — schedule deactivation with minimum time
      scheduleDeactivate();
    }
  }, [events]);

  return (
    <div>
      <div className="flex flex-1 flex-col gap-5 lg:flex-row">
        <UnstableCard className="h-[790px] flex-1 overflow-hidden">
          <UnstableCardHeader>
            <UnstableCardTitle>
              Agent Network
              <Badge variant="success" className="flex items-center gap-1.5 font-mono">
                <Radio className="h-3 w-3 animate-pulse" />
                Live
              </Badge>
            </UnstableCardTitle>
            <UnstableCardDescription>
              Real-time visualization of agent communication and governance decisions
            </UnstableCardDescription>
          </UnstableCardHeader>
          <UnstableCardContent className="flex-1">
            <div className="h-full">
              <ConstellationView currentEvent={currentEvent} processedEvents={events} />
            </div>
          </UnstableCardContent>
        </UnstableCard>

        <AuditLogPanel events={events} />
      </div>
    </div>
  );
};
