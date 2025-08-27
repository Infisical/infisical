export function providerSpecificPayload(url: string, initialPayload: Record<string, unknown>) {
  const { hostname } = new URL(url);

  const payload: Record<string, unknown> = initialPayload;

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

  // Modify Azure logs to be in an array and use TimeGenerated instead of createdAt
  if (hostname.endsWith(".ingest.monitor.azure.com")) {
    const { createdAt, ...restOfPayload } = payload;
    const transformedPayload: Record<string, unknown> = { ...restOfPayload };
    if (createdAt) {
      transformedPayload.TimeGenerated = createdAt;
    }
    return [transformedPayload];
  }

  return payload;
}
