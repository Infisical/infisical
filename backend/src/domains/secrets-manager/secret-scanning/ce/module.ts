import { ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ProjectPermission, TProjectsDomain } from "@app/domains/platform/projects/ce/module";

export type TSecretScanningDomain = {
  // What the actor may do in a Secret Scanning project: the generic project roles.
  getSecretScanningPermission: (input: { actor: TActorContext; projectId: string }) => Promise<ProjectPermission>;
};

export type TSecretScanningDeps = {
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
};

// Secret Scanning: its permission for now. It grows as Secret Scanning moves into a domain.
export class SecretScanningModule {
  readonly name = "secret-scanning";

  readonly service: TSecretScanningDomain;

  constructor({ projectsDomain }: TSecretScanningDeps) {
    this.service = {
      getSecretScanningPermission: ({ actor, projectId }) =>
        projectsDomain.getProjectPermission({ actor, projectId, type: ProjectType.SecretScanning })
    };
  }
}
