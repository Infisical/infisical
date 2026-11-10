import { isAxiosError } from "axios";

import { toast as v4Toast } from "@app/components/v4/ui/sonner";
import type { ToastItem } from "@app/components/v4/ui/toast-stack";

const byTone = {
  ok: v4Toast.success,
  bad: v4Toast.error,
  neutral: v4Toast.info,
  loading: v4Toast.loading
};

export const toast = ({
  tone = "neutral",
  title,
  description,
  action,
  duration
}: Omit<ToastItem, "id" | "icon">) =>
  byTone[tone](title, { description, action, ...(duration === undefined ? {} : { duration }) });

export const dismissToast = (id: string | number) => v4Toast.dismiss(id);

export const saved = (title: string) => toast({ tone: "ok", title });

const errorMessage = (error: unknown) => {
  const serverMessage = isAxiosError(error) ? error.response?.data?.message : undefined;
  if (typeof serverMessage === "string" && serverMessage) return serverMessage;
  return error instanceof Error ? error.message : undefined;
};

export const failed = (title: string, error?: unknown) =>
  toast({ tone: "bad", title, description: errorMessage(error) });
