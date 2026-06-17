import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
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
          toast: "!pointer-events-auto !items-start !rounded-md !pl-5 !py-3",
          icon: "!mt-0.5",
          title: "!text-sm !font-medium !text-foreground whitespace-pre-line",
          description: "!text-xs !text-foreground/75 whitespace-pre-line",
          closeButton:
            "!left-auto !right-2 !top-2 !transform-none !rounded-sm !border-transparent !bg-transparent !text-foreground/60 hover:!bg-foreground/10 hover:!text-foreground",
          actionButton:
            "!self-end !rounded-sm !border !border-border !bg-transparent !text-foreground hover:!bg-foreground/10 hover:!border-foreground/20",
          cancelButton:
            "!self-end !rounded !border !border-border !bg-transparent !text-foreground/80 hover:!bg-foreground/10",
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
