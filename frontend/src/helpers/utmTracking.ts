const HUBSPOT_UTK_STORAGE_KEY = "infisical__hubspot-utk";

/**
 * Reads the HubSpot tracking cookie (hubspotutk) if present,
 * falling back to localStorage for cases where cookies may have
 * been cleared during OAuth redirects (e.g. Safari ITP).
 */
export const getHubSpotUtk = (): string | undefined => {
  const match = document.cookie.match(/(?:^|;\s*)hubspotutk=([^;]*)/);
  return match?.[1] || localStorage.getItem(HUBSPOT_UTK_STORAGE_KEY) || undefined;
};

/**
 * Persists the current hubspotutk cookie value to localStorage
 * so it survives OAuth redirects that may clear cookies.
 * Call this before navigating away for OAuth.
 */
export const preserveHubSpotUtk = (): void => {
  const match = document.cookie.match(/(?:^|;\s*)hubspotutk=([^;]*)/);
  if (match?.[1]) {
    localStorage.setItem(HUBSPOT_UTK_STORAGE_KEY, match[1]);
  }
};
