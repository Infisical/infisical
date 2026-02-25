import { useState } from "react";
import { CheckCircle, ChevronDown, ChevronRight, Clock, Shield, XCircle } from "lucide-react";

import {
  Badge,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";

import { AGENTS, DEMO_EVENTS, type DemoEvent } from "../data";

type Session = {
  id: string;
  title: string;
  description: string;
  events: DemoEvent[];
  duration: number;
  approvedCount: number;
  deniedCount: number;
};

const agentNameMap = Object.fromEntries(AGENTS.map((a) => [a.id, a.name]));

const buildSessions = (): Session[] => {
  const involvedAgents = [...new Set(DEMO_EVENTS.map((e) => agentNameMap[e.agentId]))];
  const approvedCount = DEMO_EVENTS.filter((e) => e.status === "approved").length;
  const deniedCount = DEMO_EVENTS.filter((e) => e.status === "denied").length;
  const firstTs = DEMO_EVENTS[0]?.timestamp ?? 0;
  const lastTs = DEMO_EVENTS[DEMO_EVENTS.length - 1]?.timestamp ?? 0;

  return [
    {
      id: "session-1",
      title: "Billing Inquiry — Ticket #4021",
      description: `${involvedAgents.join(" → ")} flow`,
      events: DEMO_EVENTS,
      duration: lastTs - firstTs,
      approvedCount,
      deniedCount
    }
  ];
};

const SESSIONS = buildSessions();

export const SessionsTab = () => {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {SESSIONS.map((session) => {
        const isExpanded = expandedSession === session.id;

        return (
          <UnstableCard key={session.id}>
            <UnstableCardHeader
              className="cursor-pointer"
              onClick={() => setExpandedSession(isExpanded ? null : session.id)}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted" />
                  )}
                  <div>
                    <UnstableCardTitle>{session.title}</UnstableCardTitle>
                    <p className="mt-1 text-sm text-accent">{session.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">{session.approvedCount} approved</Badge>
                  {session.deniedCount > 0 && (
                    <Badge variant="danger">{session.deniedCount} denied</Badge>
                  )}
                  <Badge variant="neutral" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {session.duration}s
                  </Badge>
                </div>
              </div>
            </UnstableCardHeader>

            {isExpanded && (
              <UnstableCardContent>
                <div className="space-y-2.5">
                  {session.events.map((event) => (
                    <div
                      key={event.id}
                      className={`rounded border border-l-[4px] p-3 ${
                        event.status === "approved"
                          ? "border-border border-l-success bg-container"
                          : "border-danger/20 border-l-danger bg-container"
                      }`}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={event.status === "approved" ? "success" : "danger"}>
                            {event.status.toUpperCase()}
                          </Badge>
                          <span className="font-mono text-xs text-muted">
                            {event.timestamp.toFixed(2)}s
                          </span>
                        </div>
                        {event.status === "approved" ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-danger" />
                        )}
                      </div>

                      <div className="mb-1 text-sm font-medium">
                        <span className="text-info capitalize">{event.agentId}</span>
                        <span className="mx-1 text-muted">→</span>
                        <span className="text-foreground">{event.action}</span>
                      </div>

                      <div className="mb-2 text-xs text-accent">{event.details}</div>

                      {event.reasoning && (
                        <div
                          className={`rounded-sm p-2 text-xs ${
                            event.status === "approved"
                              ? "bg-card text-accent"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-1 text-muted">
                            <Shield className="h-3 w-3" />
                            <span className="text-[10px] tracking-wider uppercase">
                              Infisical Arbiter
                            </span>
                          </div>
                          &quot;{event.reasoning}&quot;
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </UnstableCardContent>
            )}
          </UnstableCard>
        );
      })}
    </div>
  );
};
