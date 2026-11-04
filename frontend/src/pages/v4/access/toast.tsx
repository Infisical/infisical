import { ToastStack, type ToastItem } from "@app/components/v4/ui/toast-stack";

import { createFixtureStore } from "../data/fixture-store";

const toasts = createFixtureStore<ToastItem[]>([]);

export const toast = (item: Omit<ToastItem, "id">) =>
  toasts.update((current) => [...current, { ...item, id: crypto.randomUUID() }]);

export const saved = (title: string) => toast({ tone: "ok", title });

export const failed = (title: string, error?: unknown) =>
  toast({
    tone: "bad",
    title,
    description: error instanceof Error ? error.message : undefined
  });

export const AccessToasts = () => (
  <ToastStack
    items={toasts.use()}
    onDismiss={(id) => toasts.update((current) => current.filter((item) => item.id !== id))}
  />
);
