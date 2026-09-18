import { SessionStorageKeys } from "@app/const";

/**
 * Retrieves and consumes the stored login redirect URL (e.g., from deep links like /pam/access).
 * Returns the URL if valid and not expired, otherwise undefined.
 */
export const consumeLoginRedirectUrl = (): string | undefined => {
  const loginRedirectInfo = sessionStorage.getItem(
    SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL
  );
  if (!loginRedirectInfo) return undefined;

  sessionStorage.removeItem(SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL);

  try {
    const { expiry, data: redirectUrl } = JSON.parse(loginRedirectInfo) as {
      expiry: string;
      data: string;
    };
    if (new Date() < new Date(expiry) && redirectUrl) {
      return redirectUrl;
    }
  } catch {
    // Invalid JSON - ignore
  }
  return undefined;
};
