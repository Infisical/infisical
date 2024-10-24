import { ProjectUserAdditionalPrivilegeSchema } from "@app/db/schemas";

import { UnpackedPermissionSchema } from "./permission";

export const SanitizedUserProjectAdditionalPrivilegeSchema = ProjectUserAdditionalPrivilegeSchema.extend({
  permissions: UnpackedPermissionSchema.array()
});
