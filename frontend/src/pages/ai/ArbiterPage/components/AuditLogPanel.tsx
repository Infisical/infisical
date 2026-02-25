import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CheckCircle, Clock, Shield, XCircle } from "lucide-react";

import {
  Badge,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";

import type { DemoEvent } from "../data";

interface AuditLogPanelProps {
  events: DemoEvent[];
}

export const AuditLogPanel = ({ events }: AuditLogPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <UnstableCard className="w-full lg:w-[420px] lg:shrink-0">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-success" />
          Audit Log
        </UnstableCardTitle>
        <UnstableCardDescription className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" />
          Live event stream
        </UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent className="-mx-5 -mb-5">
        <div
          ref={scrollRef}
          className="h-[500px] space-y-2.5 overflow-y-auto scroll-smooth px-5 pb-5"
        >
          <AnimatePresence initial={false}>
            {events.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className={`rounded border border-l-[4px] p-3 ${
                  event.status === "approved"
                    ? "border-border border-l-success bg-container"
                    : "border-danger/20 border-l-danger bg-danger/5"
                }`}
              >
                {/* Status + Timestamp */}
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

                {/* Agent → Action */}
                <div className="mb-1 text-sm font-medium">
                  <span className="text-info capitalize">{event.agentId}</span>
                  <span className="mx-1 text-muted">→</span>
                  <span className="text-foreground">{event.action}</span>
                </div>

                {/* Details */}
                <div className="mb-2 text-xs text-accent">{event.details}</div>

                {/* Reasoning */}
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
              </motion.div>
            ))}
          </AnimatePresence>

          {events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <Clock className="mb-3 h-8 w-8 opacity-50" />
              <p className="text-sm font-medium">Waiting for events...</p>
              <p className="text-xs">Click Start to begin the simulation</p>
            </div>
          )}
        </div>
      </UnstableCardContent>
    </UnstableCard>
  );
};
