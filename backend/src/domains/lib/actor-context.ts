import type { TPlanProps } from "@app/domains/platform/license/ce/module";
import type { TPrincipal } from "@app/lib/auth/principal";

export type TActorOrg = {
  id: string;
  name: string;
  rootOrgId: string;
  parentOrgId: string;
  shouldUseNewPrivilegeSystem: boolean;
};

// Who is acting and in which org, built once per request by the auth middleware (req.permission) and by
// systemContext for background jobs. The project is not here: a permission function loads it from the id
// it is given, because the project depends on the call, not the request.
export type TActorContext = {
  principal: TPrincipal;
  org: TActorOrg;
  // Fetched on first call and kept for the rest of the request.
  plan: () => Promise<TPlanProps>;
};

export const memoizePlan = (load: () => Promise<TPlanProps>): (() => Promise<TPlanProps>) => {
  let pending: Promise<TPlanProps> | undefined;
  return () => {
    if (!pending) {
      pending = load().catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
};
