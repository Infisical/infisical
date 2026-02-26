import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { TAgentGateAuditLog } from "@app/hooks/api/agentGate/types";

import type { DemoEvent } from "../data";
import { AuditLogPanel } from "./AuditLogPanel";
import { ConstellationView } from "./ConstellationView";

const mapLogToEvent = (log: TAgentGateAuditLog): DemoEvent => ({
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

interface SessionReplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: TAgentGateAuditLog[];
  sessionTitle: string;
}

const REPLAY_INTERVAL_MS = 2000;

export const SessionReplayModal = ({
  isOpen,
  onClose,
  logs,
  sessionTitle
}: SessionReplayModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const events = logs.map(mapLogToEvent);
  const totalEvents = events.length;
  const currentEvent = currentIndex >= 0 && currentIndex < totalEvents ? events[currentIndex] : null;
  const processedEvents = currentIndex >= 0 ? events.slice(0, currentIndex + 1).reverse() : [];

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stepForward = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= totalEvents - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [totalEvents]);

  const stepBack = useCallback(() => {
    setCurrentIndex((prev) => Math.max(-1, prev - 1));
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      clearTimer();
      return;
    }

    const tick = () => {
      setCurrentIndex((prev) => {
        if (prev >= totalEvents - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
      timerRef.current = setTimeout(tick, REPLAY_INTERVAL_MS);
    };

    timerRef.current = setTimeout(tick, currentIndex === -1 ? 500 : REPLAY_INTERVAL_MS);

    return clearTimer;
  }, [isPlaying, totalEvents, clearTimer]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(-1);
      setIsPlaying(false);
      clearTimer();
    }
  }, [isOpen, clearTimer]);

  // Cleanup on unmount
  useEffect(() => clearTimer, [clearTimer]);

  const handlePlayPause = () => {
    if (currentIndex >= totalEvents - 1) {
      // Restart from beginning
      setCurrentIndex(-1);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    clearTimer();
    setCurrentIndex(-1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-hidden p-0" showCloseButton>
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-3">
            Session Replay — {sessionTitle}
            <Badge variant="neutral" className="font-mono text-xs">
              {Math.max(0, currentIndex + 1)} / {totalEvents}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-4">
          {/* Progress bar */}
          <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-success transition-all duration-300"
              style={{
                width: `${totalEvents > 0 ? ((currentIndex + 1) / totalEvents) * 100 : 0}%`
              }}
            />
          </div>

          {/* Controls */}
          <div className="mb-4 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePlayPause}
            >
              {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
              {isPlaying ? "Pause" : currentIndex >= totalEvents - 1 ? "Restart" : "Play"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={stepBack}
              disabled={isPlaying || currentIndex <= -1}
            >
              <SkipBackIcon className="h-4 w-4" />
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={stepForward}
              disabled={isPlaying || currentIndex >= totalEvents - 1}
            >
              <SkipForwardIcon className="h-4 w-4" />
              Step
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={currentIndex === -1}
            >
              <RotateCcwIcon className="h-4 w-4" />
              Reset
            </Button>

            {currentEvent && (
              <div className="ml-auto flex items-center gap-2 text-xs text-muted">
                <Badge variant={currentEvent.status === "approved" ? "success" : "danger"}>
                  {currentEvent.status.toUpperCase()}
                </Badge>
                <span className="capitalize">
                  {currentEvent.agentId.replace(/_/g, " ")}
                </span>
                <span className="text-accent">→ {currentEvent.action}</span>
              </div>
            )}
          </div>

          {/* Constellation View + Audit Log */}
          <div className="flex h-[70vh] gap-4">
            <div className="flex-1">
              <ConstellationView
                currentEvent={currentEvent}
                processedEvents={processedEvents}
              />
            </div>
            <AuditLogPanel
              events={processedEvents}
              title="Replay Log"
              description="Session event replay"
              className="!h-full"
              fillHeight
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
