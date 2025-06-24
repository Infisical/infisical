// Specific DataDog log intake hostnames
const dataDogHostnames = [
  "http-intake.logs.datadoghq.com",
  "http-intake.logs.us3.datadoghq.com",
  "http-intake.logs.us5.datadoghq.com",
  "http-intake.logs.datadoghq.eu",
  "http-intake.logs.ap1.datadoghq.com",
  "http-intake.logs.ddog-gov.com"
];

export function providerSpecificPayload(url: string) {
  const payload: Record<string, string> = {};

  // If URL is for DataDog, add a "ddsource: infisical" entry
  if (
    dataDogHostnames.some((hostname) => url.startsWith(`https://${hostname}`) || url.startsWith(`http://${hostname}`))
  ) {
    payload.ddsource = "infisical";
    payload.service = "audit-logs";
  }

  return payload;
}
