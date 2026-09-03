import type { ActivityEntry as Entry } from "../useRunStream.js";

/**
 * One line of what the agent is doing, beneath the step it belongs to.
 *
 * Tool calls show in-flight and then resolved, which is why the emitter sends a call/result pair
 * rather than one event after the fact: a click that hangs is the single most useful thing to be
 * able to see, and a post-hoc event shows nothing at all until it unhangs.
 */

const TOOL_STATE_GLYPH = { running: "···", ok: "ok", failed: "failed" } as const;

export const ActivityEntry = ({ entry }: { entry: Entry }): JSX.Element => {
  switch (entry.kind) {
    case "thinking":
      return <div className="activity__thinking">{entry.text}</div>;

    case "text":
      return <div className="activity__text">{entry.text}</div>;

    case "tool":
      return (
        <div>
          <div className={`activity__tool activity__tool--${entry.state}`}>
            <span className="activity__tool-name">{entry.name}</span>
            {entry.arg ? <span className="activity__tool-arg">{entry.arg}</span> : null}
            <span className="activity__tool-state">{TOOL_STATE_GLYPH[entry.state]}</span>
          </div>
          {/* On its own line, not appended to the chip. A failure reason is a full sentence, and
              inline it either clipped mid-word or squeezed the argument down to one character. */}
          {entry.state === "failed" && entry.detail ? (
            <div className="activity__tool-detail">{entry.detail}</div>
          ) : null}
        </div>
      );

    case "finding": {
      // Only BLOCKER gets the red treatment. A label mismatch is a real finding but not a stop, and
      // colouring every severity alike would make the one that halts the walk unremarkable.
      const blocking = entry.severity === "BLOCKER";
      return (
        <div className={`activity__finding${blocking ? " activity__finding--blocker" : ""}`}>
          <div className="eyebrow">{entry.severity}</div>
          <div className="activity__finding-summary">{entry.summary}</div>
        </div>
      );
    }

    default:
      return <></>;
  }
};
