import { entitlementsResponseSchema, TEntitlementsResponse, TLicenseClientBackend } from "./license-client-types";

const ENTITLEMENTS_PATH = "/v1/entitlements";

export const licenseServerBackend = (serverUrl: string, serviceKey: string): TLicenseClientBackend => ({
  fetchEntitlements: async (orgId: string): Promise<TEntitlementsResponse> => {
    const url = new URL(ENTITLEMENTS_PATH, serverUrl);
    url.searchParams.set("org_id", orgId);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${serviceKey}` },
      redirect: "manual"
    });
    if (!res.ok) {
      throw new Error(`license server responded with ${res.status}`);
    }
    const body: unknown = await res.json();
    return entitlementsResponseSchema.parse(body);
  }
});
