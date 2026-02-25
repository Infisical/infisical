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

const EVENT_HIGHLIGHT_DURATION_MS = 3000;

const mapAuditLogToEvent = (log: TAgentGateAuditLog): DemoEvent => ({
  id: log.id,
  agentId: log.requestingAgentId,
  targetAgentId: log.targetAgentId || undefined,
  action: log.action,
  details: `${log.actionType}: ${log.action}`,
  status: log.result === "allowed" ? "approved" : "denied",
  reasoning: log.policyEvaluations?.[0]?.reasoning ?? "",
  timestamp: log.timestamp
});

export const LiveFeedTab = () => {
  const { currentProject } = useProject();
  const projectId = currentProject.id;

  const { data: auditData } = useQueryAgentGateAuditLogs({ projectId, limit: 50 });

  const [currentEvent, setCurrentEvent] = useState<DemoEvent | null>(null);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const events: DemoEvent[] = useMemo(() => {
    if (!auditData?.logs) return [];
    return auditData.logs.map(mapAuditLogToEvent);
  }, [auditData?.logs]);

  // Detect new events and highlight the most recent one
  useEffect(() => {
    if (!auditData?.logs?.length) return;

    const currentIds = new Set(auditData.logs.map((l) => l.id));
    const newEvents = auditData.logs.filter((l) => !previousIdsRef.current.has(l.id));

    if (newEvents.length > 0 && previousIdsRef.current.size > 0) {
      // Highlight the newest event (logs are sorted desc by timestamp)
      const newest = mapAuditLogToEvent(newEvents[0]);
      setCurrentEvent(newest);

      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setCurrentEvent(null);
      }, EVENT_HIGHLIGHT_DURATION_MS);
    }

    previousIdsRef.current = currentIds;
  }, [auditData?.logs]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

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
        <UnstableCard className="h-[700px] flex-1 overflow-hidden">
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
