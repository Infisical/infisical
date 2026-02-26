import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GavelIcon, NetworkIcon, ScaleIcon, Shield } from "lucide-react";
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
  { x: 120, y: 200 }
];

const getIcon = (name: string) => {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name];
  return Icon ? <Icon className="h-6 w-6" /> : null;
};

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
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md rounded-b-lg border border-border bg-bunker-900">
      {/* Grid/Network Background */}
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.07"
            />
            <circle cx="0" cy="0" r="1" fill="currentColor" opacity="0.15" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Central Governance Node */}
      <div className="absolute z-10">
        <motion.div
          animate={{
            scale: currentEvent ? 1.03 : 1,
            filter: `drop-shadow(0 0 ${currentEvent ? 18 : 12}px ${statusColor.glow})`,
            y: [0, -3, 0],
            x: [0, 2, 0, -2, 0]
          }}
          transition={{
            scale: { duration: 0.6 },
            filter: { duration: 0.6 },
            y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
            x: { duration: 8, repeat: Infinity, ease: "easeInOut" }
          }}
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

          <ScaleIcon className={`relative z-10 h-8 w-8 ${statusColor.text}`} />

          {/* Network Arbiter Label */}
          <div className="absolute -top-14 mt-4 translate-y-full font-mono text-[10px] tracking-widest text-muted uppercase">
            Network Arbiter
          </div>

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
          const isAgentToAgent = Boolean(currentEvent?.targetAgentId);
          const isActive =
            currentEvent?.agentId === agent.id || currentEvent?.targetAgentId === agent.id;
          const isSource = currentEvent?.agentId === agent.id;
          const isTarget = currentEvent?.targetAgentId === agent.id;

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
                  scale: isActive ? 1.04 : 1,
                  opacity: isActive ? 1 : 0.85,
                  y: [0, -2.5, 0],
                  x: [0, 2 + index * 0.5, 0, -(2 + index * 0.5), 0]
                }}
                transition={{
                  scale: { duration: 0.5 },
                  opacity: { duration: 0.5 },
                  y: { duration: 5 + index * 0.8, repeat: Infinity, ease: "easeInOut" },
                  x: { duration: 7 + index, repeat: Infinity, ease: "easeInOut" }
                }}
                className="flex flex-col items-center"
              >
                <div className="rounded-full bg-bunker-800">
                  <div
                    className={`flex h-20 w-20 items-center justify-center rounded-full border transition-shadow duration-500 ${
                      isActive
                        ? currentEvent?.status === "approved"
                          ? "border-success bg-success/10 shadow-[0_0_15px_rgba(46,204,113,0.2)]"
                          : "border-danger bg-danger/10 shadow-[0_0_15px_rgba(231,76,60,0.2)]"
                        : "border-border"
                    }`}
                  >
                    <div className="text-accent">{getIcon(agent.icon)}</div>
                  </div>
                </div>
                <div className="mt-2 w-24 text-center font-mono text-[10px] tracking-widest text-muted uppercase">
                  {agent.name}
                </div>
              </motion.div>

              {/* Connection Line to Center */}
              <svg className="absolute -z-10 overflow-visible" style={{ left: 48, top: 48 }}>
                <line
                  x1="0"
                  y1="0"
                  x2={-pos.x}
                  y2={-pos.y}
                  stroke={
                    isActive
                      ? currentEvent?.status === "approved"
                        ? "#2ecc71"
                        : "#e74c3c"
                      : "var(--color-accent)"
                  }
                  strokeWidth={isActive ? 1 : 1}
                  strokeDasharray="6 4"
                  style={
                    isActive
                      ? isTarget
                        ? { animation: "marchingAntsReverse 1s linear infinite" }
                        : { animation: "marchingAnts 1s linear infinite" }
                      : {
                          animation: `linePulse ${5 + index}s ease-in-out infinite, marchingAntsSlow ${12 + index * 2}s linear infinite, lineBreath ${6 + index}s ease-in-out infinite`
                        }
                  }
                />

                {/* Particle traveling along line: agent→center for source, center→agent for target */}
                {isSource && currentEvent && (
                  <motion.circle
                    r="3"
                    fill={currentEvent.status === "approved" ? "#2ecc71" : "#e74c3c"}
                  >
                    <animateMotion dur="1s" repeatCount="1" path={`M 0 0 L ${-pos.x} ${-pos.y}`} />
                  </motion.circle>
                )}
                {isTarget && isAgentToAgent && currentEvent && (
                  <motion.circle
                    r="3"
                    fill={currentEvent.status === "approved" ? "#2ecc71" : "#e74c3c"}
                  >
                    <animateMotion
                      dur="1s"
                      repeatCount="1"
                      begin="0.5s"
                      path={`M ${-pos.x} ${-pos.y} L 0 0`}
                    />
                  </motion.circle>
                )}
              </svg>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="absolute right-4 bottom-4 z-20 rounded-md border border-border bg-bunker-900/80 p-3 backdrop-blur-sm">
        <div className="mb-2 font-mono text-[10px] tracking-widest text-muted uppercase">
          Legend
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path
                d="M7 1 L12.5 4 V10 L7 13 L1.5 10 V4 Z"
                fill="rgba(241, 196, 15, 0.1)"
                stroke="#f1c40f"
                strokeWidth="0.8"
              />
            </svg>
            <span className="font-mono text-[10px] text-muted">Network Arbiter</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle
                cx="7"
                cy="7"
                r="5.5"
                fill="rgba(255,255,255,0.05)"
                stroke="var(--color-border)"
                strokeWidth="0.8"
              />
            </svg>
            <span className="font-mono text-[10px] text-muted">AI Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="6" viewBox="0 0 14 6">
              <line
                x1="0"
                y1="3"
                x2="14"
                y2="3"
                stroke="#2ecc71"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            </svg>
            <span className="font-mono text-[10px] text-muted">Approved</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="6" viewBox="0 0 14 6">
              <line
                x1="0"
                y1="3"
                x2="14"
                y2="3"
                stroke="#e74c3c"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            </svg>
            <span className="font-mono text-[10px] text-muted">Denied</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="6" viewBox="0 0 14 6">
              <line
                x1="0"
                y1="3"
                x2="14"
                y2="3"
                stroke="var(--color-accent)"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            </svg>
            <span className="font-mono text-[10px] text-muted">Idle / Inactive</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes marchingAnts {
          to { stroke-dashoffset: -20; }
        }
        @keyframes marchingAntsReverse {
          to { stroke-dashoffset: 20; }
        }
        @keyframes linePulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
        @keyframes marchingAntsSlow {
          to { stroke-dashoffset: -20; }
        }
        @keyframes lineBreath {
          0%, 100% { stroke-width: 0.5; }
          50% { stroke-width: 0.8; }
        }
      `}</style>
    </div>
  );
};
