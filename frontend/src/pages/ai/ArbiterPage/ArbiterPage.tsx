import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Play, RotateCcw, Square } from "lucide-react";

import { ContentLoader, PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AuditLogPanel } from "./components/AuditLogPanel";
import { ConstellationView } from "./components/ConstellationView";
import { DEMO_EVENTS, type DemoEvent } from "./data";

const EVENT_DISPLAY_DURATION_MS = 2000;

export const ArbiterPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();

  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processedEvents, setProcessedEvents] = useState<DemoEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<DemoEvent | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentEventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setElapsedTime(0);
    setProcessedEvents([]);
    setCurrentEvent(null);
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentEventTimeoutRef.current) clearTimeout(currentEventTimeoutRef.current);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      if (processedEvents.length >= DEMO_EVENTS.length) {
        handleReset();
      }
      setIsPlaying(true);
    }
  }, [isPlaying, processedEvents.length, handleReset]);

  useEffect(() => {
    if (!isPlaying) return;

    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => {
        const next = prev + 0.1;
        const lastTimestamp = DEMO_EVENTS[DEMO_EVENTS.length - 1]?.timestamp ?? 0;
        if (next > lastTimestamp + 3) {
          setIsPlaying(false);
          if (timerRef.current) clearInterval(timerRef.current);
        }
        return next;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;

    const nextEvent = DEMO_EVENTS.find(
      (evt) => evt.timestamp <= elapsedTime && !processedEvents.some((pe) => pe.id === evt.id)
    );

    if (nextEvent) {
      setProcessedEvents((prev) => [...prev, nextEvent]);
      setCurrentEvent(nextEvent);

      if (currentEventTimeoutRef.current) clearTimeout(currentEventTimeoutRef.current);
      currentEventTimeoutRef.current = setTimeout(() => {
        setCurrentEvent(null);
      }, EVENT_DISPLAY_DURATION_MS);
    }
  }, [elapsedTime, isPlaying, processedEvents]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (currentEventTimeoutRef.current) clearTimeout(currentEventTimeoutRef.current);
    };
  }, []);

  if (!currentProject) {
    return <ContentLoader />;
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      <Helmet>
        <title>{t("common.head-title", { title: "Arbiter" })}</title>
      </Helmet>

      <PageHeader
        scope={ProjectType.AI}
        title="Arbiter"
        description="Monitor agent activity, review governance decisions, and replay sessions"
      >
        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="font-mono">
            {elapsedTime.toFixed(1)}s
          </Badge>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw />
            Reset
          </Button>
          <Button variant={isPlaying ? "danger" : "project"} size="sm" onClick={handleTogglePlay}>
            {isPlaying ? (
              <>
                <Square />
                Stop
              </>
            ) : (
              <>
                <Play />
                Start
              </>
            )}
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Network Visualization */}
        <UnstableCard className="flex-1 overflow-hidden">
          <UnstableCardHeader>
            <UnstableCardTitle>Agent Network</UnstableCardTitle>
            <UnstableCardDescription>
              Real-time visualization of agent communication and governance decisions
            </UnstableCardDescription>
          </UnstableCardHeader>
          <UnstableCardContent>
            <div className="h-[500px]">
              <ConstellationView currentEvent={currentEvent} processedEvents={processedEvents} />
            </div>
          </UnstableCardContent>
        </UnstableCard>

        {/* Audit Log */}
        <AuditLogPanel events={processedEvents} />
      </div>
    </div>
  );
};
