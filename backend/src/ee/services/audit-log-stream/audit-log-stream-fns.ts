export function providerSpecificPayload(url: string) {
  const payload: Record<string, string> = {};

  // If URL is related to DataDog, add a "ddsource: infisical" entry
  if (url.includes("datadoghq")) {
    payload.ddsource = "infisical";
  }

  return payload;
}
