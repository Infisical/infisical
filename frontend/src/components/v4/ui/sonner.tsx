"use client";

import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import {
  type ExternalToast,
  toast as sonnerToast,
  Toaster as Sonner,
  type ToasterProps
} from "sonner";

import { useV4Theme } from "../scope";
import { Spinner } from "./spinner";

import styles from "./sonner.module.css";

export const V4_TOASTER_ID = "infisical-v4";

type Message = Parameters<typeof sonnerToast>[0];
const routed = (data?: ExternalToast): ExternalToast => ({
  ...data,
  toasterId: data?.toasterId ?? V4_TOASTER_ID
});

export const toast = Object.assign(
  (message: Message, data?: ExternalToast) => sonnerToast(message, routed(data)),
  {
    success: (message: Message, data?: ExternalToast) => sonnerToast.success(message, routed(data)),
    error: (message: Message, data?: ExternalToast) => sonnerToast.error(message, routed(data)),
    info: (message: Message, data?: ExternalToast) => sonnerToast.info(message, routed(data)),
    warning: (message: Message, data?: ExternalToast) => sonnerToast.warning(message, routed(data)),
    loading: (message: Message, data?: ExternalToast) => sonnerToast.loading(message, routed(data)),
    message: (message: Message, data?: ExternalToast) => sonnerToast.message(message, routed(data)),
    promise: <T,>(
      promise: Parameters<typeof sonnerToast.promise<T>>[0],
      data?: Parameters<typeof sonnerToast.promise<T>>[1]
    ) => sonnerToast.promise<T>(promise, { ...data, toasterId: data?.toasterId ?? V4_TOASTER_ID }),
    custom: (jsx: Parameters<typeof sonnerToast.custom>[0], data?: ExternalToast) =>
      sonnerToast.custom(jsx, routed(data)),
    dismiss: (id?: number | string) => {
      if (id !== undefined) return sonnerToast.dismiss(id);
      sonnerToast
        .getToasts()
        .filter((item) => "toasterId" in item && item.toasterId === V4_TOASTER_ID)
        .forEach((item) => sonnerToast.dismiss(item.id));
      return undefined;
    }
  }
);

const Toaster = ({ ...props }: ToasterProps) => {
  const resolvedTheme = useV4Theme();

  return (
    <Sonner
      theme={props.theme ?? resolvedTheme ?? "system"}
      className={styles.toaster}
      expand
      gap={8}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Spinner />
      }}
      style={{ "--width": "min(400px, calc(100vw - 32px))" } as React.CSSProperties}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: styles.toast,
          icon: styles.icon,
          content: styles.content,
          title: styles.title,
          description: styles.description,
          actionButton: styles.action
        }
      }}
      {...props}
      id={props.id ?? V4_TOASTER_ID}
    />
  );
};

export { Toaster };

export { type ToastItem, ToastStack } from "./toast-stack";
