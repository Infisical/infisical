import { cva, VariantProps } from "cva";

import { cn } from "../../utils";

type EmptyFrameProps = {
  // Draws the dashed/solid frame with an SVG rect instead of a CSS border.
  // CSS `border-style: dashed` has no dash-length control; `stroke-dasharray`
  // does, and unlike `border-image` it still respects the rounded corners.
  // Opt-in and off by default so existing `className="border"` consumers
  // (the CSS-border convention documented in this file's stories) render
  // unchanged — this is a distinct, additive frame for new call sites.
  frame?: "none" | "dashed" | "solid";
  // Merged onto the frame's default `text-border` (e.g. to recolor on drag-active)
  frameClassName?: string;
};

function Empty({
  className,
  frame = "none",
  frameClassName,
  children,
  ...props
}: React.ComponentProps<"div"> & EmptyFrameProps) {
  const box = (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-md border-dashed border-border bg-container p-6 text-center text-balance text-foreground shadow-inner md:p-12",
        frame !== "none" && "relative",
        className
      )}
      {...props}
    >
      {frame !== "none" && (
        <svg
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 size-full text-border transition-colors duration-75",
            frameClassName
          )}
        >
          <rect
            x="1"
            y="1"
            rx="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={frame === "dashed" ? "10 6" : undefined}
            style={{ width: "calc(100% - 2px)", height: "calc(100% - 2px)" }}
          />
        </svg>
      )}
      {children}
    </div>
  );

  // Only the SVG-framed variant gets outer breathing room — the plain CSS-border
  // convention (className="border") keeps its existing flush layout untouched.
  if (frame === "none") return box;

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
