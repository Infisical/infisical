import { ProjectUserAdditionalPrivilegeSchema } from "@app/db/schemas";
import { UnpackedPermissionSchema } from "@app/lib/casl/permission-schemas";

export const SanitizedUserProjectAdditionalPrivilegeSchema = ProjectUserAdditionalPrivilegeSchema.extend({
  permissions: UnpackedPermissionSchema.array()
});
