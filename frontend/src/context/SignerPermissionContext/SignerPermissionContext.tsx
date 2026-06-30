import { createResourcePermissionSuspenseHook } from "@app/helpers/resourcePermissions";
import { fetchUserSignerPermissions, signerKeys } from "@app/hooks/api/signers/queries";

import { SignerPermissionSet } from "./types";

export const useSignerPermission = createResourcePermissionSuspenseHook<SignerPermissionSet>({
  paramName: "signerId",
  hookName: "useSignerPermission",
  queryKey: (signerId) => signerKeys.getUserSignerPermissions({ signerId }),
  fetchFn: (signerId) => fetchUserSignerPermissions({ signerId })
});
