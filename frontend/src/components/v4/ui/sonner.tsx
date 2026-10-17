"use client";

import { useTheme } from "next-themes";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-v4-toast-ok" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4 text-v4-toast-bad" />,
        loading: <Loader2Icon className="size-4 animate-spin" />
      }}
      style={
        {
          "--normal-bg": "var(--v4-toast-bg)",
          "--normal-text": "var(--v4-toast-text)",
          "--normal-border": "var(--v4-toast-line)",
          "--border-radius": "var(--radius)"
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-v4-pop!"
        }
      }}
      {...props}
    />
  );
};

export { Toaster };
