import { CheckCircle, Clock, Shield, XCircle } from "lucide-react";

import {
  Badge,
  UnstableAccordion,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger
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
  return (
    <UnstableAccordion type="single" collapsible>
      {SESSIONS.map((session) => (
        <UnstableAccordionItem key={session.id} value={session.id}>
          <UnstableAccordionTrigger>
            <div className="flex flex-1 items-center justify-between">
              <div>
                <span className="font-medium">{session.title}</span>
                <p className="mt-0.5 text-xs text-accent">{session.description}</p>
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
          </UnstableAccordionTrigger>
          <UnstableAccordionContent>
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
          </UnstableAccordionContent>
        </UnstableAccordionItem>
      ))}
    </UnstableAccordion>
  );
};
