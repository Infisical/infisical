import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GavelIcon, Shield } from "lucide-react";
import * as Icons from "lucide-react";

import { AGENTS, type DemoEvent } from "../data";

interface ConstellationViewProps {
  currentEvent: DemoEvent | null;
  processedEvents: DemoEvent[];
}

const AGENT_POSITIONS = [
  { x: -200, y: -150 },
  { x: 250, y: -80 },
  { x: -220, y: 120 },
  { x: 180, y: 180 }
];

const getIcon = (name: string) => {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name];
  return Icon ? <Icon className="h-5 w-5" /> : null;
};

// Generate stable starfield positions once
const STARS = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  top: `${(i * 37 + 13) % 100}%`,
  left: `${(i * 53 + 7) % 100}%`,
  size: `${(i % 3) + 1}px`,
  delay: `${(i % 5) + 2}s`
}));

export const ConstellationView = ({ currentEvent }: ConstellationViewProps) => {
  const statusColor = useMemo(() => {
    if (!currentEvent)
      return {
        stroke: "#f1c40f",
        glow: "rgba(241, 196, 15, 0.2)",
        fill: "rgba(241, 196, 15, 0.05)",
        text: "text-warning"
      };
    if (currentEvent.status === "approved")
      return {
        stroke: "#2ecc71",
        glow: "rgba(46, 204, 113, 0.5)",
        fill: "rgba(46, 204, 113, 0.1)",
        text: "text-success"
      };
    return {
      stroke: "#e74c3c",
      glow: "rgba(231, 76, 60, 0.5)",
      fill: "rgba(231, 76, 60, 0.1)",
      text: "text-danger"
    };
  }, [currentEvent]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded rounded-b-lg border border-border bg-bunker-900">
      {/* Starfield */}
      <div className="absolute inset-0">
        {STARS.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-foreground opacity-10"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              animation: `twinkle ${star.delay} infinite`
            }}
          />
        ))}
      </div>

      {/* Central Governance Node */}
      <div className="absolute z-10">
        <motion.div
          animate={{
            scale: currentEvent ? 1.1 : 1,
            filter: `drop-shadow(0 0 ${currentEvent ? 30 : 20}px ${statusColor.glow})`
          }}
          transition={{ duration: 0.5 }}
          className="relative flex h-32 w-32 animate-pulse items-center justify-center"
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
            <motion.path
              key={currentEvent ? currentEvent.id : "idle"}
              d="M50 0 L93.3 25 V75 L50 100 L6.7 75 V25 Z"
              fill="none"
              stroke={statusColor.stroke}
              strokeWidth="1"
              initial={{ pathLength: currentEvent ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={currentEvent ? { duration: 1 } : { duration: 0 }}
            />
            <path d="M50 10 L85 30 V70 L50 90 L15 70 V30 Z" fill={statusColor.fill} stroke="none" />
          </svg>

          <GavelIcon className={`relative z-10 h-8 w-8 ${statusColor.text}`} />

          {/* Policy Decision Text */}
          <AnimatePresence>
            {currentEvent && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-full mt-4 w-64 text-center"
              >
                <div
                  className={`mb-1 font-mono text-xs ${
                    currentEvent.status === "approved" ? "text-success" : "text-danger"
                  }`}
                >
                  [{currentEvent.status.toUpperCase()}]
                </div>
                <div className="text-[10px] leading-tight text-accent">
                  {currentEvent.reasoning}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Agent Nodes */}
      <div className="absolute inset-0">
        {AGENTS.map((agent, index) => {
          const pos = AGENT_POSITIONS[index];
          const isActive =
            currentEvent?.agentId === agent.id || currentEvent?.targetAgentId === agent.id;
          const isSource = currentEvent?.agentId === agent.id;

          return (
            <div
              key={agent.id}
              className="absolute top-1/2 left-1/2"
              style={{
                transform: `translate(${pos.x - 48}px, ${pos.y - 48}px)`
              }}
            >
              <motion.div
                animate={{
                  scale: isActive ? 1.1 : 1
                  // opacity: isActive ? 1 : 0.5
                }}
                transition={{ duration: 0.4 }}
                className={`flex h-24 w-24 flex-col items-center justify-center rounded-full border bg-card transition-shadow duration-500 ${
                  isActive
                    ? "border-info shadow-[0_0_30px_rgba(255,255,255,0.15)]"
                    : "border-border"
                }`}
              >
                <div className="mb-1 text-foreground">{getIcon(agent.icon)}</div>
                <div className="font-mono text-[10px] tracking-widest text-muted uppercase">
                  {agent.name}
                </div>
              </motion.div>

              {/* Connection Line to Center */}
              <svg className="absolute -z-10 overflow-visible" style={{ left: 48, top: 48 }}>
                <motion.line
                  x1="0"
                  y1="0"
                  x2={-pos.x}
                  y2={-pos.y}
                  stroke={
                    isActive
                      ? currentEvent?.status === "approved"
                        ? "#2ecc71"
                        : "#e74c3c"
                      : "var(--color-border)"
                  }
                  strokeWidth={isActive ? 1 : 0.5}
                  strokeDasharray={isActive ? "0" : "2 4"}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                />

                {/* Particle traveling along line */}
                {isSource && currentEvent && (
                  <motion.circle
                    r="3"
                    fill={currentEvent.status === "approved" ? "#2ecc71" : "#e74c3c"}
                  >
                    <animateMotion dur="1s" repeatCount="1" path={`M 0 0 L ${-pos.x} ${-pos.y}`} />
                  </motion.circle>
                )}
              </svg>
            </div>
          );
        })}
      </div>

      {/* Twinkle keyframes */}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};
