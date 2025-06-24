export function providerSpecificPayload(url: string) {
  const { hostname } = new URL(url);

  const payload: Record<string, string> = {};

  switch (hostname) {
    case "http-intake.logs.datadoghq.com":
    case "http-intake.logs.us3.datadoghq.com":
    case "http-intake.logs.us5.datadoghq.com":
    case "http-intake.logs.datadoghq.eu":
    case "http-intake.logs.ap1.datadoghq.com":
    case "http-intake.logs.ddog-gov.com":
      payload.ddsource = "infisical";
      payload.service = "audit-logs";
      break;
    default:
      break;
  }

  return payload;
}
