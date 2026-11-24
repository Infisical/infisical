import { ProjectType } from "@app/db/schemas";
import { StandardProjectRoles } from "@app/domains/platform/projects/ce/module";

// The generic roles, which include the cryptographic operator that KMS projects offer.
export const kmsProjectRoles = StandardProjectRoles.generic(ProjectType.KMS);
