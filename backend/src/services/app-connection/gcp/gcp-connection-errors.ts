export type TGoogleApiError = {
  error?: {
    status?: string;
    message?: string;
    errors?: { reason?: string }[];
    details?: { "@type"?: string; reason?: string }[];
  };
};

export const isGcpServiceDisabledError = (body: TGoogleApiError | undefined, message: string) =>
  Boolean(body?.error?.details?.some((detail) => detail.reason === "SERVICE_DISABLED")) ||
  Boolean(body?.error?.errors?.some((err) => err.reason === "accessNotConfigured")) ||
  message.includes("has not been used in project");
