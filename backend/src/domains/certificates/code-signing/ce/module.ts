import type { TActorContext } from "@app/domains/lib/actor-context";
import type { ProjectResourcePermission, TProjectsDomain } from "@app/domains/platform/projects/ce/module";

import { getSignerPermission } from "./service/signer-permission";
import { SignerPermissionSet } from "./service/signer-roles";

export { signerRoles } from "./service/signer-permission";
export * from "./service/signer-roles";

export type TCodeSigningDomain = {
  // What the actor may do on one signer: its signer role, with the project-admin fallback.
  getSignerPermission: (input: {
    actor: TActorContext;
    projectId: string;
    signerId: string;
  }) => Promise<ProjectResourcePermission<SignerPermissionSet>>;
};

export type TCodeSigningDeps = {
  projectsDomain: TProjectsDomain;
};

// Code Signing: its signer roles and permission for now. It grows as signers move into a domain.
export class CodeSigningModule {
  readonly name = "code-signing";

  readonly service: TCodeSigningDomain;

  constructor({ projectsDomain }: TCodeSigningDeps) {
    this.service = { getSignerPermission: (input) => getSignerPermission(projectsDomain, input) };
  }
}
