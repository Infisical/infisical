import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// The v3 toast keeps a neutral container surface and carries intent through a colored icon and
// a left accent strip in the status color, while the title and description stay neutral. sonner
// is CSS-variable driven, so the shared surface is set via --normal-* and the per-type accent is
// added through sonner's per-type classNames.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-danger" />,
        loading: <Loader2Icon className="size-4 animate-spin text-foreground/60" />
      }}
      toastOptions={{
        classNames: {
          // pointer-events-auto keeps the toast clickable over a modal (Radix sets
          // pointer-events:none outside itself); items-start aligns the icon with the title;
          // pl-5 clears the accent strip.
          toast: "!pointer-events-auto !items-start !rounded-md !pl-5",
          icon: "!mt-0.5",
          title: "!text-sm !font-medium !text-foreground whitespace-pre-line",
          description: "!text-xs !text-foreground/75 whitespace-pre-line",
          // Square close button seated inside the toast body at the top-right.
          closeButton:
            "!left-auto !right-2 !top-2 !transform-none !rounded-sm !border-transparent !bg-transparent !text-foreground/60 hover:!bg-foreground/10 hover:!text-foreground",
          // self-end seats the action at the bottom of the toast; sonner's margin-left:auto
          // pushes it right, so it lands bottom-right, clear of the top-right close button.
          actionButton:
            "!self-end !rounded !border !border-border !bg-foreground/10 !text-foreground hover:!bg-foreground/20",
          cancelButton:
            "!self-end !rounded !border !border-border !bg-transparent !text-foreground/80 hover:!bg-foreground/10",
          // Status accent: a 4px strip painted as a hard-stop gradient so the card's radius
          // rounds the strip's outer corner while the gradient stop keeps the inner edge
          // straight (a left border would curve on the inside and look crescent-shaped).
          success:
            "!border-l-0 !bg-[linear-gradient(to_right,var(--color-success)_4px,transparent_4px)]",
          info: "!border-l-0 !bg-[linear-gradient(to_right,var(--color-info)_4px,transparent_4px)]",
          warning:
            "!border-l-0 !bg-[linear-gradient(to_right,var(--color-warning)_4px,transparent_4px)]",
          error:
            "!border-l-0 !bg-[linear-gradient(to_right,var(--color-danger)_4px,transparent_4px)]"
        }
      }}
      style={
        {
          "--width": "400px",
          "--border-radius": "0.375rem",
          "--normal-bg": "var(--color-container)",
          "--normal-border": "var(--color-border)",
          "--normal-text": "var(--color-foreground)"
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
