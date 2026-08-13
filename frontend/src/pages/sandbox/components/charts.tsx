import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Small chart primitives for the sandbox surfaces, drawn as raw SVG.
 *
 * The app has no charting library, and these are shapes rather than plots: no axes, no legend, no
 * tooltips. Everything shares one silver gradient so a sparkline on a card and the chart on the
 * dashboard read as the same instrument at two sizes.
 */

const CHROME_STOPS = (
  <>
    <stop offset="0%" stopColor="#71717a" />
    <stop offset="25%" stopColor="#e4e4e7" />
    <stop offset="45%" stopColor="#ffffff" />
    <stop offset="65%" stopColor="#a9b3bd" />
    <stop offset="100%" stopColor="#f4f4f5" />
  </>
);

/**
 * Slots on the time axis, one per sample, so at the 1s sample rate these are seconds.
 *
 * Fixed rather than derived from the sample count, for two reasons: a derived axis stretches a
 * half-full buffer across the full width and then visibly compresses it as history accumulates, and
 * the whole 90-sample buffer is more points than these widths can resolve, which reads as noise.
 */
/**
 * Rounds an axis ceiling up to a readable step. `peak * 1.25` produced labels like "106%", which
 * reads as a rendering fault beside a headline of "46.7%". Steps run past 100 deliberately: CPU is
 * reported per container, so a two-vCPU sandbox can legitimately exceed 100%.
 */
export const niceCeiling = (peak: number) =>
  [5, 10, 25, 50, 100, 200, 400].find((step) => step >= peak * 1.15) ?? 400;

export const METRIC_WINDOW = 45;
/** The card spark is a fraction of the width, so it shows a correspondingly shorter slice. */
const SPARK_WINDOW = 24;

/**
 * How many samples are drawn past the right edge. This is the jitter buffer: the visible edge lags
 * the newest reading, so a poll arriving late still has geometry to slide into instead of stalling.
 */
const OVERSCAN = 2;

/**
 * Slides a rendered trace leftwards, driven per frame from the clock.
 *
 * The offset is `-step × (time since the last sample ÷ how long samples actually take to arrive)`.
 * Both terms are measured, never assumed, and that is the whole trick. Earlier attempts drove this
 * from the nominal 1s interval — as a CSS animation, then as a phase advanced by a fixed amount —
 * and both drift, because a poll does not arrive in exactly 1000ms. The drift accumulates until it
 * hits a clamp (a freeze) or a correction (a jump).
 *
 * Measuring the interval makes it self-correcting: if polls really take 1150ms, the phase reaches 1
 * after 1150ms, which is exactly when the next sample lands and the geometry shifts a slot. The two
 * cancel with no correction to apply.
 */
const useSlide = (step: number, sample: unknown) => {
  const ref = useRef<SVGGElement>(null);
  const arrivedAtRef = useRef(0);
  const intervalRef = useRef(1000);

  useLayoutEffect(() => {
    const now = performance.now();
    const observed = now - arrivedAtRef.current;

    // Smoothed, and outliers ignored: a backgrounded tab or a paused query would otherwise poison
    // the estimate with one absurd gap and stall the line for a long time afterwards.
    if (arrivedAtRef.current && observed > 200 && observed < 5000) {
      intervalRef.current = intervalRef.current * 0.7 + observed * 0.3;
    }

    arrivedAtRef.current = now;
  }, [sample]);

  useEffect(() => {
    if (!step) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let frame = 0;
    const tick = () => {
      const phase = (performance.now() - arrivedAtRef.current) / intervalRef.current;
      // Clamped to the buffer: with nothing left to reveal, rest at the edge rather than dragging a
      // gap in behind the line.
      const offset = -step * Math.min(Math.max(phase, 0), OVERSCAN);
      if (ref.current) ref.current.style.transform = `translateX(${offset}px)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  return ref;
};

const buildPath = (
  values: number[],
  width: number,
  height: number,
  max: number,
  /**
   * Exponent applied to the normalised value. Below 1 it lifts the bottom of the range, so the
   * single-digit CPU a mostly-idle sandbox actually reports still has visible shape instead of
   * sitting flat on the baseline.
   */
  curve = 1,
  windowSize = METRIC_WINDOW
) => {
  const slots = Math.max(windowSize, 2);
  const step = width / (slots - 1);

  // Drawn past the right edge and clipped by the viewBox until the slide brings each one into view.
  const recent = values.slice(-(slots + OVERSCAN));
  if (!recent.length) return { line: "", area: "", step };

  // Back-filled with zero so the trace spans the full width from the very first sample, instead of
  // starting partway across with a visible cut. Not an invention: before the container existed it
  // was using no CPU and no memory, so zero is what was actually true for that stretch.
  const missing = slots + OVERSCAN - recent.length;
  const shown = missing > 0 ? [...(new Array(missing).fill(0) as number[]), ...recent] : recent;
  if (shown.length < 2) return { line: "", area: "", step };

  // Right-aligned with the newest OVERSCAN steps past the edge, so a short history grows leftwards
  // into empty space instead of being stretched to fill it.
  const offset = width + step * OVERSCAN - (shown.length - 1) * step;
  // The plot is inset by half a stroke top and bottom. Without it a reading of zero lands exactly on
  // the viewBox edge and half the stroke is clipped away, so an idle sandbox drew nothing at all
  // rather than the flatline it should.
  const inset = 1.5;
  const usable = height - inset * 2;
  const y = (value: number) => height - inset - (Math.min(value, max) / max) ** curve * usable;

  const points = shown.map((value, index) => `${offset + index * step},${y(value)}`);
  const line = `M${points.join(" L")}`;
  const last = offset + (shown.length - 1) * step;
  const area = `${line} L${last},${height} L${offset},${height} Z`;

  return { line, area, step };
};

/**
 * A card-sized trend line. `max` is fixed by the caller rather than derived from the data, so a
 * flat idle sandbox draws a flat line instead of noise magnified to full height.
 */
export const Sparkline = ({
  values,
  max = 100,
  className = "",
  gradientId,
  isEmphasised = false,
  scaleToData = false
}: {
  values: number[];
  max?: number;
  className?: string;
  gradientId: string;
  /**
   * Fits the axis to the data instead of a fixed ceiling. Real CPU sits in single digits against a
   * 0-100 axis, so the trace hugs the floor and the panel is mostly dead space — and the headline
   * reading then looks like it disagrees with the chart.
   */
  scaleToData?: boolean;
  /**
   * Rescales to the series' own peak and lifts the low end. A card sparkline is a glance at whether
   * anything is happening, not a reading, and against a fixed 0-100 axis a real workload is a flat
   * line. The dashboard chart keeps a true axis, so the precise number is still available.
   */
  isEmphasised?: boolean;
}) => {
  const width = 120;
  const height = 28;

  // Floored so an idle sandbox does not amplify rounding noise into a mountain range.
  const peak = Math.max(...values.slice(-SPARK_WINDOW), 0);
  const isFitted = isEmphasised || scaleToData;
  // Floored so an idle sandbox does not amplify rounding noise into a mountain range.
  const effectiveMax = isFitted ? niceCeiling(peak) : max;
  const { line, area, step } = buildPath(
    values,
    width,
    height,
    effectiveMax,
    isEmphasised ? 0.6 : 1,
    SPARK_WINDOW
  );
  const slideRef = useSlide(step, values);

  if (!line) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none">
        <line
          x1="0"
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="currentColor"
          strokeWidth="1"
          className="text-border"
        />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none">
      <defs>
        {/* userSpaceOnUse, not the default objectBoundingBox: a flat trace has a zero-height
            bounding box, and a bounding-box gradient is not painted at all in that case, so an idle
            sandbox rendered no line. */}
        <linearGradient
          id={`${gradientId}-stroke`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={width}
          y2="0"
        >
          {CHROME_STOPS}
        </linearGradient>
        <linearGradient
          id={`${gradientId}-fill`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2={height}
        >
          <stop offset="0%" stopColor="#e4e4e7" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#e4e4e7" stopOpacity="0" />
        </linearGradient>

        {/* Both ends are masked, so a reading fades in as it scrolls on and fades out as it leaves,
            rather than being clipped mid-stroke at the edge. Applied to a wrapper that does not
            slide, so the soft edges stay put while the trace travels through them. */}
        <linearGradient
          id={`${gradientId}-edge`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={width}
          y2="0"
        >
          <stop offset="0%" stopColor="#000000" />
          <stop offset="14%" stopColor="#ffffff" />
          <stop offset="86%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#000000" />
        </linearGradient>
        <mask id={`${gradientId}-edge-mask`}>
          <rect x="0" y="0" width={width} height={height} fill={`url(#${gradientId}-edge)`} />
        </mask>
      </defs>
      <g mask={`url(#${gradientId}-edge-mask)`}>
        <g ref={slideRef}>
          {/* No fill in emphasised mode, and mitred joins rather than rounded: a trace reads as a
            heartbeat when the peaks come to a point, and a filled area rounds them off. */}
          {!isEmphasised && <path d={area} fill={`url(#${gradientId}-fill)`} />}
          <path
            d={line}
            fill="none"
            stroke={`url(#${gradientId}-stroke)`}
            strokeWidth={isEmphasised ? 1.25 : 1.5}
            strokeLinejoin={isEmphasised ? "miter" : "round"}
            strokeLinecap={isEmphasised ? "butt" : "round"}
            strokeMiterlimit={10}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </g>
    </svg>
  );
};

/** The dashboard's larger trend, with a gridline behind it and a pulsing head on the newest point. */
export const MetricChart = ({
  values,
  max,
  unit,
  gradientId,
  height = 120
}: {
  values: number[];
  max: number;
  unit: string;
  gradientId: string;
  height?: number;
}) => {
  const width = 600;
  const { line, area, step } = buildPath(values, width, height, max);
  const slideRef = useSlide(step, values);
  const last = values[values.length - 1] ?? 0;
  const headY = height - (Math.min(last, max) / max) * height;
  // One step past the edge, matching the newest point, so it travels in with the line.
  const headX = values.length > 1 ? width + step : 0;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height }}
      >
        <defs>
          <linearGradient
            id={`${gradientId}-stroke`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2={width}
            y2="0"
          >
            {CHROME_STOPS}
          </linearGradient>
          <linearGradient
            id={`${gradientId}-fill`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2={height}
          >
            <stop offset="0%" stopColor="#e4e4e7" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#e4e4e7" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            y1={height * fraction}
            x2={width}
            y2={height * fraction}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 5"
            className="text-border/60"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <g ref={slideRef}>
          {line && <path d={area} fill={`url(#${gradientId}-fill)`} />}
          {line && (
            <path
              d={line}
              fill="none"
              stroke={`url(#${gradientId}-stroke)`}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {line && (
            <circle cx={headX} cy={headY} r="2.5" fill="#f4f4f5" className="sandbox-pulse-dot" />
          )}
        </g>
      </svg>

      <div className="pointer-events-none absolute top-0 right-0 flex flex-col items-end">
        <span className="font-mono text-[10px] text-muted">
          {max}
          {unit}
        </span>
      </div>
      <div className="pointer-events-none absolute right-0 bottom-0">
        <span className="font-mono text-[10px] text-muted">0{unit}</span>
      </div>
    </div>
  );
};

/** A radial dial for a bounded reading, used for memory against the container's real limit. */
export const Dial = ({
  value,
  max,
  label,
  sublabel
}: {
  value: number;
  max: number;
  label: string;
  sublabel: string;
}) => {
  const size = 132;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * radius * 1.5;
  const fraction = max > 0 ? Math.min(value / max, 1) : 0;

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`}>
        <defs>
          <linearGradient id="dial-chrome" x1="0" y1="0" x2="1" y2="1">
            {CHROME_STOPS}
          </linearGradient>
        </defs>
        {/* Three quarters of a circle, rotated so the gap sits at the bottom. */}
        <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference * 2}`}
            className="text-mineshaft-600"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#dial-chrome)"
            strokeWidth={stroke}
            // Butt, not round: rounded caps add half a stroke width at each end, which on a small
            // reading is most of the arc's length and turns it into a dot rather than a short arc.
            strokeLinecap="round"
            // Floored at a minimum sweep rather than a length: below about a tenth of the arc a
            // reading is shorter than the stroke is thick and reads as a nub. The number under the
            // dial carries the precision, so the arc only has to say "a little".
            strokeDasharray={`${
              fraction > 0 ? Math.max(circumference * fraction, circumference * 0.1) : 0
            } ${circumference * 3}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-9 flex flex-col items-center">
        <span className="sandbox-chrome-text text-2xl font-semibold">{label}</span>
        <span className="text-[11px] text-muted">{sublabel}</span>
      </div>
    </div>
  );
};

/**
 * Counts to a new value rather than snapping, so a polled figure reads as a live instrument. Only
 * animates changes, so the first paint shows the real number immediately.
 */
export const CountUp = ({ value, decimals = 0 }: { value: number; decimals?: number }) => {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) return undefined;

    const start = performance.now();
    const duration = 500;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out, so it decelerates into the new reading
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + delta * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  return <>{shown.toFixed(decimals)}</>;
};
