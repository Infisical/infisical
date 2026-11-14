import type { TOrgWithSubOrgs } from "@app/hooks/api";

const org = (
  id: string,
  name: string,
  userJoinedAt: string,
  subOrganizations: TOrgWithSubOrgs["subOrganizations"] = []
) => ({ id, name, slug: id, userJoinedAt, subOrganizations }) as unknown as TOrgWithSubOrgs;

export const PREVIEW_ORGS: TOrgWithSubOrgs[] = [
  org("acme", "Acme Corp", "2024-03-12T00:00:00Z", [
    { id: "acme-eu", name: "Acme EU", slug: "acme-eu", userJoinedAt: "2024-06-02T00:00:00Z" },
    { id: "acme-labs", name: "Acme Labs", slug: "acme-labs", userJoinedAt: "2025-01-18T00:00:00Z" },
    {
      id: "acme-payments",
      name: "Acme Payments",
      slug: "acme-payments",
      userJoinedAt: "2025-09-04T00:00:00Z"
    }
  ]),
  org("globex", "Globex", "2023-11-30T00:00:00Z"),
  org("initech", "Initech Platform", "2025-05-21T00:00:00Z"),
  org("umbrella", "Umbrella Security", "2026-02-08T00:00:00Z")
];
