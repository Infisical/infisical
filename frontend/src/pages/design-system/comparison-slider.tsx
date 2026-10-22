import {
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
  useLayoutEffect,
  useRef,
  useState
} from "react";

import { useV4Theme } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import styles from "./comparison-slider.module.css";

export type ComparisonSliderProps = {
  title: string;
  before: { light?: string; dark?: string };
  After: ComponentType;
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export const ComparisonSlider = ({ title, before, After }: ComparisonSliderProps) => {
  const theme = useV4Theme() ?? "light";
  const [position, setPosition] = useState(50);
  const [view, setView] = useState<"compare" | "live">("compare");
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return undefined;
    const fit = () => setScale(node.clientWidth / 1706);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view]);
  const shot = before[theme] ?? before.light ?? before.dark;
  const move = (event: PointerEvent<HTMLElement>) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    setPosition(clamp(((event.clientX - box.left) / box.width) * 100));
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const targets: Record<string, number> = {
      ArrowLeft: position - step,
      ArrowRight: position + step,
      Home: 0,
      End: 100
    };
    const next = event.key in targets ? targets[event.key] : null;
    if (next === null) return;
    event.preventDefault();
    setPosition(clamp(next));
  };
  return (
    <div data-slot="comparison-slider">
      <div className={styles.toolbar}>
        <ToggleGroup
          type="single"
          size="sm"
          aria-label={`${title} view`}
          value={view}
          onValueChange={(value) => {
            if (value === "compare" || value === "live") setView(value);
          }}
        >
          <ToggleGroupItem value="compare">Compare</ToggleGroupItem>
          <ToggleGroupItem value="live">Live, full width</ToggleGroupItem>
        </ToggleGroup>
        {view === "compare" && (
          <Button variant="ghost" size="sm" onClick={() => setPosition(50)}>
            Reset
          </Button>
        )}
      </div>
      {view === "live" ? (
        <div className={styles.full}>
          <div>
            <After />
          </div>
        </div>
      ) : (
        <div
          ref={stage}
          className={styles.stage}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("[data-comparison-handle]")) {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              move(event);
            }
          }}
          onPointerMove={(event) => {
            if (dragging.current) move(event);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
        >
          <div
            className={styles.after}
            style={{ transform: `scale(${scale})` }}
            aria-label={`${title}, v4`}
            role="group"
          >
            <After />
          </div>
          <div className={styles.before} style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
            {shot ? (
              <img src={shot} alt={`${title}, current app on main (${theme} theme)`} />
            ) : (
              <div className={styles.missing}>
                {before.light || before.dark
                  ? "No capture for this theme"
                  : "The before capture is pending"}
              </div>
            )}
          </div>
          <span className={styles.label} style={{ left: "var(--v4-space-8)" }}>
            Before, main
          </span>
          <span className={styles.label} style={{ right: "var(--v4-space-8)" }}>
            After, v4
          </span>
          <button
            type="button"
            data-comparison-handle=""
            role="slider"
            aria-label={`Compare ${title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`${Math.round(position)}% before`}
            className={styles.handle}
            style={{ left: `${position}%` }}
            onKeyDown={key}
          >
            <span className={styles.grip}>
              <Icon name="chev-ud" size={14} style={{ rotate: "90deg" }} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
