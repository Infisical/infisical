import { useEffect, useMemo, useRef, useState } from "react";
import { Radio } from "lucide-react";

import {
  Badge,
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
  timestamp: log.timestamp
});

export const LiveFeedTab = () => {
  const { currentProject } = useProject();
  const projectId = currentProject.id;

  // Capture mount time so we only show events that arrive after page load
  const [mountTime] = useState(() => new Date().toISOString());
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);

  const { data: auditData } = useQueryAgentGateAuditLogs({
    projectId,
    limit: 50,
    startTime: mountTime,
    sessionId: activeSessionId
  });

  const previousLatestIdRef = useRef<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState<DemoEvent | null>(null);

  const events: DemoEvent[] = useMemo(() => {
    if (!auditData?.logs?.length) return [];
    return auditData.logs.map(mapAuditLogToEvent);
  }, [auditData?.logs]);

  // Lock onto the first sessionId we see
  useEffect(() => {
    if (activeSessionId || !auditData?.logs?.length) return;
    const firstSession = auditData.logs.find((l) => l.sessionId)?.sessionId;
    if (firstSession) {
      setActiveSessionId(firstSession);
    }
  }, [auditData?.logs, activeSessionId]);

  // Highlight the latest event — stays active until a new one arrives
  useEffect(() => {
    if (!events.length) return;
    const latestId = events[0].id;
    if (latestId !== previousLatestIdRef.current) {
      previousLatestIdRef.current = latestId;
      setCurrentEvent(events[0]);
    }
  }, [events]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Badge variant="success" className="flex items-center gap-1.5 font-mono">
          <Radio className="h-3 w-3 animate-pulse" />
          Live
        </Badge>
        <span className="text-xs text-muted">Connected</span>
      </div>

      <div className="flex flex-1 flex-col gap-5 lg:flex-row">
        <UnstableCard className="h-[790px] flex-1 overflow-hidden">
          <UnstableCardHeader>
            <UnstableCardTitle>Agent Network</UnstableCardTitle>
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
