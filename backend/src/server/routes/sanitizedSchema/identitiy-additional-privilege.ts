import { IdentityProjectAdditionalPrivilegeSchema } from "@app/db/schemas";

import { UnpackedPermissionSchema } from "./permission";

export const SanitizedIdentityPrivilegeSchema = IdentityProjectAdditionalPrivilegeSchema.omit({
  projectMembershipId: true
}).extend({
  permissions: UnpackedPermissionSchema.array()
});
