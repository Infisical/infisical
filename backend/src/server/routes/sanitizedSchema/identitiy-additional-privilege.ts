import { IdentityProjectAdditionalPrivilegeSchema } from "@app/db/schemas";

import { UnpackedPermissionSchema } from "./permission";

export const SanitizedIdentityPrivilegeSchema = IdentityProjectAdditionalPrivilegeSchema.extend({
  permissions: UnpackedPermissionSchema.array()
});
