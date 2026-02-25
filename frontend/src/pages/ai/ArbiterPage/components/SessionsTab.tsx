import { CheckCircle, Clock, Shield, XCircle } from "lucide-react";

import {
  Badge,
  UnstableAccordion,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger,
  UnstableCard,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
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
    <UnstableCard>
      <UnstableCardHeader>
        <UnstableCardTitle>Sessions</UnstableCardTitle>
        <UnstableCardDescription>View agent session activity and arbiter decisions.</UnstableCardDescription>
      </UnstableCardHeader>
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
              <UnstableTable>
                <UnstableTableHeader>
                  <UnstableTableRow>
                    <UnstableTableHead>Status</UnstableTableHead>
                    <UnstableTableHead>Agent</UnstableTableHead>
                    <UnstableTableHead>Action</UnstableTableHead>
                    <UnstableTableHead>Details</UnstableTableHead>
                    <UnstableTableHead>Reasoning</UnstableTableHead>
                    <UnstableTableHead>Time</UnstableTableHead>
                  </UnstableTableRow>
                </UnstableTableHeader>
                <UnstableTableBody>
                  {session.events.map((event) => (
                    <UnstableTableRow key={event.id}>
                      <UnstableTableCell>
                        <div className="flex items-center gap-2">
                          {event.status === "approved" ? (
                            <CheckCircle className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-danger" />
                          )}
                          <Badge variant={event.status === "approved" ? "success" : "danger"}>
                            {event.status.toUpperCase()}
                          </Badge>
                        </div>
                      </UnstableTableCell>
                      <UnstableTableCell>
                        <span className="text-info capitalize">{event.agentId}</span>
                      </UnstableTableCell>
                      <UnstableTableCell>{event.action}</UnstableTableCell>
                      <UnstableTableCell>
                        <span className="text-xs text-accent">{event.details}</span>
                      </UnstableTableCell>
                      <UnstableTableCell>
                        {event.reasoning && (
                          <div className="flex items-center gap-1 text-xs text-muted">
                            <Shield className="h-3 w-3 shrink-0" />
                            &quot;{event.reasoning}&quot;
                          </div>
                        )}
                      </UnstableTableCell>
                      <UnstableTableCell>
                        <span className="font-mono text-xs text-muted">
                          {event.timestamp.toFixed(2)}s
                        </span>
                      </UnstableTableCell>
                    </UnstableTableRow>
                  ))}
                </UnstableTableBody>
              </UnstableTable>
            </UnstableAccordionContent>
          </UnstableAccordionItem>
        ))}
      </UnstableAccordion>
    </UnstableCard>
  );
};
