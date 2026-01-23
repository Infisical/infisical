import { IdentityProjectAdditionalPrivilegeSchema } from "@app/db/schemas/identity-project-additional-privilege";

import { UnpackedPermissionSchema } from "./permission";

export const SanitizedIdentityPrivilegeSchema = IdentityProjectAdditionalPrivilegeSchema.omit({
  projectMembershipId: true
}).extend({
  permissions: UnpackedPermissionSchema.array()
});
