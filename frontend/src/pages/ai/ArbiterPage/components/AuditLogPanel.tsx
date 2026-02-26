import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CheckCircle, Shield, XCircle } from "lucide-react";

import {
  Badge,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";

import type { DemoEvent } from "../data";

interface AuditLogPanelProps {
  events: DemoEvent[];
}

export const AuditLogPanel = ({ events }: AuditLogPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <UnstableCard className="w-full gap-y-0 lg:w-[420px] lg:shrink-0">
      <UnstableCardHeader className="!mb-0 border-b">
        <UnstableCardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-success" />
          Event Log
        </UnstableCardTitle>
        <UnstableCardDescription className="flex items-center gap-1.5">
          Live event stream
        </UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent className="-mx-5 !mt-0 -mb-5 py-0">
        <div ref={scrollRef} className="h-[701px] space-y-2.5 overflow-y-auto px-5 py-4 pb-5">
          <AnimatePresence initial={false}>
            {events.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`rounded border border-l-[4px] p-3 ${
                  event.status === "approved"
                    ? "border-border border-l-success bg-container"
                    : "border-border border-l-danger bg-container"
                }`}
              >
                {/* Status + Timestamp */}
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={event.status === "approved" ? "success" : "danger"}>
                      {event.status.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-xs text-muted">
                      {new Date(event.timestamp).toLocaleTimeString()}
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
                  <span className="text-foreground capitalize">
                    {event.agentId.replace("_", " ")}
                  </span>
                  <span className="mx-1 text-muted">→</span>
                  <span className="text-info">{event.action}</span>
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
                      <span className="text-[10px] tracking-wider uppercase">Network Arbiter</span>
                    </div>
                    &quot;{event.reasoning}&quot;
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {events.length === 0 && (
            <UnstableEmpty className="h-full border">
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>No events yet</UnstableEmptyTitle>
                <UnstableEmptyDescription>
                  Events will appear here as they stream in.
                </UnstableEmptyDescription>
              </UnstableEmptyHeader>
            </UnstableEmpty>
          )}
        </div>
      </UnstableCardContent>
    </UnstableCard>
  );
};
