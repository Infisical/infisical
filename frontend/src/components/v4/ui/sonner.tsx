"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  type ExternalToast,
  toast as sonnerToast,
  Toaster as Sonner,
  type ToasterProps,
  type ToastT,
  useSonner
} from "sonner";

import { useV4Scheme, useV4ToastLayer } from "../scope";
import { Icon } from "./icon";
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
    error: (message: Message, data?: ExternalToast) =>
      sonnerToast.error(message, routed({ duration: Infinity, ...data })),
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

const mountedToasters = new Map<string, readonly object[]>();
const toasterListeners = new Set<() => void>();
const subscribeToasters = (listener: () => void) => {
  toasterListeners.add(listener);
  return () => {
    toasterListeners.delete(listener);
  };
};
const updateToasters = (id: string, change: (tokens: readonly object[]) => readonly object[]) => {
  mountedToasters.set(id, change(mountedToasters.get(id) ?? []));
  toasterListeners.forEach((listener) => listener());
};

const useOwnsToaster = (id: string) => {
  const [token] = React.useState(() => ({}));
  React.useLayoutEffect(() => {
    updateToasters(id, (tokens) => [...tokens, token]);
    return () => updateToasters(id, (tokens) => tokens.filter((item) => item !== token));
  }, [id, token]);
  return React.useSyncExternalStore(
    subscribeToasters,
    () => mountedToasters.get(id)?.[0] === token,
    () => false
  );
};

type Announcement = { key: string; text: string };
const announcementKey = (item: ToastT) =>
  `${item.id}:${item.type ?? "default"}:${spoken(item.title)}`;
const spoken = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!React.isValidElement<{ children?: React.ReactNode }>(value)) return "";
  if (value.type !== React.Fragment && typeof value.type !== "string") return "";
  return React.Children.toArray(value.props.children).map(spoken).filter(Boolean).join(" ");
};
const announce = (fresh: ToastT[]): Announcement | null =>
  fresh.length
    ? {
        key: fresh.map(announcementKey).join("|"),
        text: fresh
          .map((item) => [spoken(item.title), spoken(item.description)].filter(Boolean).join(" "))
          .join(" ")
      }
    : null;

const ToastAnnouncer = ({ toasterId }: { toasterId: string }) => {
  const keys = useSonner()
    .toasts.filter((item) => (item.toasterId ?? undefined) === toasterId)
    .map((item) => ({ item, key: announcementKey(item) }));
  const joined = keys.map(({ key }) => key).join("\n");
  const [previous, setPrevious] = React.useState(joined);
  const [polite, setPolite] = React.useState<Announcement | null>(null);
  const [assertive, setAssertive] = React.useState<Announcement | null>(null);
  if (previous !== joined) {
    setPrevious(joined);
    const known = new Set(previous.split("\n"));
    const fresh = keys.filter(({ key }) => !known.has(key)).map(({ item }) => item);
    const errors = announce(fresh.filter((item) => item.type === "error"));
    const others = announce(fresh.filter((item) => item.type !== "error"));
    if (errors) setAssertive(errors);
    if (others) setPolite(others);
  }
  return (
    <>
      <div role="status" className="sr-only" data-slot="toast-live-polite">
        {polite && <p key={polite.key}>{polite.text}</p>}
      </div>
      <div role="alert" className="sr-only" data-slot="toast-live-assertive">
        {assertive && <p key={assertive.key}>{assertive.text}</p>}
      </div>
    </>
  );
};

const Toaster = ({ ...props }: ToasterProps) => {
  const resolvedTheme = useV4Scheme();
  const layer = useV4ToastLayer();
  const owns = useOwnsToaster(props.id ?? V4_TOASTER_ID);
  if (!owns) return null;

  const toasterId = props.id ?? V4_TOASTER_ID;
  const toaster = (
    <>
      <ToastAnnouncer toasterId={toasterId} />
      <Sonner
        ref={(node) => node?.setAttribute("aria-live", "off")}
        theme={props.theme ?? resolvedTheme ?? "system"}
        className={styles.toaster}
        expand
        closeButton
        gap={8}
        icons={{
          success: <Icon name="check-c" className="size-4" />,
          info: <Icon name="info" className="size-4" />,
          warning: <Icon name="alert" className="size-4" />,
          error: <Icon name="alert-c" className="size-4" />,
          loading: <Spinner />,
          close: <Icon name="x" />
        }}
        style={
          {
            "--width": "min(var(--v4-size-toast), calc(100vw - 2 * var(--v4-space-16)))"
          } as React.CSSProperties
        }
        toastOptions={{
          unstyled: true,
          closeButtonAriaLabel: "Dismiss notification",
          classNames: {
            toast: styles.toast,
            icon: styles.icon,
            content: styles.content,
            title: styles.title,
            description: styles.description,
            actionButton: styles.action,
            closeButton: styles.close
          }
        }}
        {...props}
        id={toasterId}
      />
    </>
  );
  return layer ? createPortal(toaster, layer) : toaster;
};

export { Toaster };

export { type ToastItem, ToastStack } from "./toast-stack";
