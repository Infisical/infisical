import { IdentityProjectAdditionalPrivilegeSchema } from "@app/db/schemas";
import { UnpackedPermissionSchema } from "@app/lib/casl/permission-schemas";

export const SanitizedIdentityPrivilegeSchema = IdentityProjectAdditionalPrivilegeSchema.omit({
  projectMembershipId: true
}).extend({
  permissions: UnpackedPermissionSchema.array()
});
