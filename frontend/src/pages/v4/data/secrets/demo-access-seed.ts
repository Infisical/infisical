import type { TFolderAccess, TFolderAccessMembership } from "@app/hooks/api/folderAccess/types";

export type DemoAccessActor = {
  type: "user" | "identity";
  id: string;
  name: string;
  email?: string;
  membership: TFolderAccessMembership;
};

export type DemoFolderAccess = {
  actors: DemoAccessActor[];
  grants: (TFolderAccess & { actor: string })[];
};

const role = (name: string) => ({ id: name.toLowerCase(), slug: name.toLowerCase(), name });

export const seedFolderAccess = (): DemoFolderAccess => ({
  actors: [
    {
      type: "user",
      id: "demo-user-sarah",
      name: "Sarah Lin",
      email: "sarah@acme.dev",
      membership: { id: "membership-sarah", isProjectAdmin: true, roles: [role("Admin")] }
    },
    {
      type: "user",
      id: "demo-user-marcus",
      name: "Marcus Webb",
      email: "marcus@acme.dev",
      membership: { id: "membership-marcus", isProjectAdmin: false, roles: [role("Developer")] }
    },
    {
      type: "user",
      id: "demo-user-priya",
      name: "Priya Natarajan",
      email: "priya@acme.dev",
      membership: { id: "membership-priya", isProjectAdmin: false, roles: [role("No access")] }
    },
    {
      type: "user",
      id: "demo-user-jordan",
      name: "Jordan Lee",
      email: "jordan@acme.dev",
      membership: { id: "membership-jordan", isProjectAdmin: false, roles: [role("No access")] }
    },
    {
      type: "identity",
      id: "demo-identity-ci",
      name: "payments-ci",
      membership: { id: "membership-ci", isProjectAdmin: false, roles: [role("No access")] }
    }
  ],
  grants: []
});
