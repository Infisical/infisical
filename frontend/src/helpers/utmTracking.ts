/**
 * Reads the HubSpot tracking cookie (hubspotutk) if present.
 */
export const getHubSpotUtk = (): string | undefined => {
  const match = document.cookie.match(/(?:^|;\s*)hubspotutk=([^;]*)/);
  return match?.[1] || undefined;
};
