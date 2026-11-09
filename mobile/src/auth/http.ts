import { hostOf } from "./config";

export class ApiError extends Error {}

const TIMEOUT_MS = 15000;

export type JsonResponse = { status: number; body: Record<string, unknown> | null };

export const requestJson = async (instance: string, path: string, init: RequestInit, action: string): Promise<JsonResponse> => {
  const host = hostOf(instance);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${instance}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
      signal: controller.signal
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? `${host} took too long to answer, so the app couldn't ${action}. Try again in a moment.`
        : `Couldn't reach ${host} to ${action}. Check the address and your connection, then try again.`
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text().catch(() => "");
  if (!text) return { status: response.status, body: null };
  try {
    const body = JSON.parse(text);
    return { status: response.status, body: typeof body === "object" && body !== null ? body : null };
  } catch {
    throw new ApiError(`${host} didn't answer like an Infisical instance, so the app couldn't ${action}. Check the address.`);
  }
};

const serverMessage = (body: JsonResponse["body"]) => {
  const message = body?.message ?? body?.error_description;
  return typeof message === "string" && message.trim() ? message.trim() : null;
};

export const isMissingRoute = ({ status, body }: JsonResponse) =>
  status === 404 && /^Route \w+:/.test(serverMessage(body) ?? "");

export const describeFailure = (instance: string, response: JsonResponse, action: string) => {
  const host = hostOf(instance);
  const message = serverMessage(response.body);
  if (isMissingRoute(response))
    return `${host} runs a version of Infisical the app can't use yet, so it couldn't ${action}. Ask your admin to update Infisical.`;
  if (response.status === 429) return `${host} is limiting requests right now. Wait a minute, then try again.`;
  if (response.status >= 500)
    return `${host} ran into a problem and couldn't ${action}. Try again in a moment.`;
  if (response.status === 403)
    return `You don't have permission to ${action} on ${host}.${message ? ` ${message}` : ""}`;
  return message
    ? `Couldn't ${action}: ${message}`
    : `${host} refused to ${action}. Try again, or sign out and back in.`;
};
