import { cva, VariantProps } from "cva";

import { cn } from "../../utils";

type EmptyFrameProps = {
  // SVG-drawn dashed/solid frame — `stroke-dasharray` controls dash proportions
  // in a way `border-style: dashed` can't. Opt-in and independent from the
  // `className="border"` CSS-border convention; frame="none" consumers are
  // byte-for-byte unchanged (no wrapper, no hover, no extra padding).
  frame?: "none" | "dashed" | "solid";
  // Stroke color via `currentColor` (e.g. `text-info` on drag-active)
  frameClassName?: string;
};

const FRAME = { stroke: 2, dash: "4 2", radius: 6 } as const;

function EmptyFrameSvg({ dashed, className }: { dashed: boolean; className?: string }) {
  const inset = FRAME.stroke / 2;

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 size-full text-border transition-colors duration-75",
        className
      )}
    >
      <rect
        x={inset}
        y={inset}
        rx={FRAME.radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={FRAME.stroke}
        strokeDasharray={dashed ? FRAME.dash : undefined}
        style={{
          width: `calc(100% - ${FRAME.stroke}px)`,
          height: `calc(100% - ${FRAME.stroke}px)`
        }}
      />
    </svg>
  );
}

function Empty({
  className,
  frame = "none",
  frameClassName,
  children,
  ...props
}: React.ComponentProps<"div"> & EmptyFrameProps) {
  const hasFrame = frame !== "none";

  const box = (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-md bg-container p-6 text-center text-balance text-foreground shadow-inner md:p-12",
        frame === "none" && "border-dashed border-border",
        hasFrame && "relative transition-colors duration-200 hover:bg-container-hover",
        className
      )}
      {...props}
    >
      {hasFrame && <EmptyFrameSvg dashed={frame === "dashed"} className={frameClassName} />}
      {children}
    </div>
  );

  // Only the SVG-framed variant gets outer breathing room — the plain CSS-border
  // convention (className="border") keeps its existing flush layout untouched.
  if (!hasFrame) return box;

  return <div className="p-0.5">{box}</div>;
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-md flex-col items-center gap-2 text-center", className)}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "bg-foreground/5 shadow-inner rounded-md text-muted flex size-10 shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-6"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-sm font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-xs/relaxed text-muted [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-foreground",
        className
      )}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className
      )}
      {...props}
    />
  );
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
