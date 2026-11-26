import { TOrgPermissionService } from "../services/org-permission/service";

const notExpected = (method: string) => async (): Promise<never> => {
  throw new Error(`FakeOrgPermissionService.${method} was called but the test did not set it`);
};

export class FakeOrgPermissionService implements TOrgPermissionService {
  canBypass = false;

  bypassLookups: { userId: string; rootOrgId: string }[] = [];

  getOrgPermission: TOrgPermissionService["getOrgPermission"] = notExpected("getOrgPermission");

  getOrgPermissionByRoles: TOrgPermissionService["getOrgPermissionByRoles"] = notExpected("getOrgPermissionByRoles");

  getGrantPermissions: TOrgPermissionService["getGrantPermissions"] = notExpected("getGrantPermissions");

  canBypassSso: TOrgPermissionService["canBypassSso"] = async (input) => {
    this.bypassLookups.push(input);
    return this.canBypass;
  };
}
