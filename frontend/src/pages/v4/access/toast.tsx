import { toast as v4Toast } from "@infisical/cipher/ui/sonner";
import type { ToastItem } from "@infisical/cipher/ui/toast-stack";
import { isAxiosError } from "axios";

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

type ValidationIssue = { path?: (string | number)[]; message?: unknown };

export const errorMessage = (error: unknown) => {
  const serverMessage: unknown = isAxiosError(error) ? error.response?.data?.message : undefined;
  if (typeof serverMessage === "string" && serverMessage) return serverMessage;
  if (Array.isArray(serverMessage)) {
    const issues = serverMessage.flatMap(({ path, message }: ValidationIssue) => {
      if (typeof message !== "string") return [];
      return [path?.length ? `${path.join(".")}: ${message}` : message];
    });
    if (issues.length) return issues.join("; ");
  }
  return error instanceof Error ? error.message : undefined;
};

export const failed = (title: string, error?: unknown) =>
  toast({ tone: "bad", title, description: errorMessage(error) });
