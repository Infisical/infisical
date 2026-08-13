import { DatabaseIcon, GlobeIcon, KeyRoundIcon, LucideIcon, TerminalIcon } from "lucide-react";

/**
 * One palette for "what did the agent touch", shared by the chat and both activity feeds.
 *
 * The colour is the point: a wall of monospace makes reaching a database and listing a directory
 * look identical, when the first is the product working and the second is noise. Defined once so a
 * PAM call is the same blue everywhere it appears.
 */

export type TToolKind = "pam" | "integration" | "shell";

export type TToolTone = {
  label: string;
  icon: LucideIcon;
  /** Text and icon colour. */
  text: string;
  /** Container border and fill for a grouped block. */
  surface: string;
  /** Small inline chip. */
  chip: string;
  /** Accent rule down the left of a grouped block. */
  rail: string;
};

export const TOOL_TONES: Record<TToolKind, TToolTone> = {
  pam: {
    label: "Database",
    icon: DatabaseIcon,
    text: "text-info",
    surface: "border-info/25 bg-info/[0.06]",
    chip: "border-info/25 bg-info/10 text-info",
    rail: "bg-info/50"
  },
  integration: {
    label: "Brokered",
    icon: KeyRoundIcon,
    text: "text-success",
    surface: "border-success/25 bg-success/[0.06]",
    chip: "border-success/25 bg-success/10 text-success",
    rail: "bg-success/50"
  },
  shell: {
    label: "Shell",
    icon: TerminalIcon,
    text: "text-muted",
    surface: "border-border bg-container/60",
    chip: "border-border bg-container text-muted",
    rail: "bg-border"
  }
};

export const BLOCKED_TONE: TToolTone = {
  label: "Blocked",
  icon: GlobeIcon,
  text: "text-danger",
  surface: "border-danger/25 bg-danger/[0.06]",
  chip: "border-danger/25 bg-danger/10 text-danger",
  rail: "bg-danger/50"
};

export const toToolKind = (kind: string | undefined): TToolKind => {
  if (kind === "pam") return "pam";
  if (kind === "integration") return "integration";
  return "shell";
};

/**
 * What the agent is doing, in the user's words rather than the shell's. The command is still there
 * to expand; this is the line that stands in for it while it runs.
 */
export const describeToolRun = (kind: TToolKind, target: string | null, isDone: boolean) => {
  if (kind === "pam") {
    return isDone
      ? `Queried ${target ?? "the database"}`
      : `Accessing ${target ?? "database"} through PAM...`;
  }

  if (kind === "integration") {
    return isDone ? `Called ${target ?? "the endpoint"}` : `Calling ${target ?? "endpoint"}...`;
  }

  return isDone ? "Ran a command" : "Running a command...";
};
