import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

export enum SignerPermissionSub {
  Signer = "pki-signer"
}

export enum SignerPermissionActions {
  Read = "read",
  Edit = "edit",
  Delete = "delete",
  ManageStatus = "manage-status",
  ManageMembers = "manage-members",
  ManagePolicy = "manage-policy",
  Sign = "sign",
  RequestSign = "request-sign",
  PreApprove = "pre-approve",
  RevokeRequest = "revoke-request",
  ReissueCertificate = "reissue-certificate",
  RevokeCertificate = "revoke-certificate",
  ExportCertificate = "export-certificate"
}

export type SignerPermissionSet = [SignerPermissionActions, SignerPermissionSub.Signer];

const buildSignerAdminPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<SignerPermissionSet>>(createMongoAbility);

  can(
    [
      SignerPermissionActions.Read,
      SignerPermissionActions.Edit,
      SignerPermissionActions.Delete,
      SignerPermissionActions.ManageStatus,
      SignerPermissionActions.ManageMembers,
      SignerPermissionActions.ManagePolicy,
      SignerPermissionActions.Sign,
      SignerPermissionActions.RequestSign,
      SignerPermissionActions.PreApprove,
      SignerPermissionActions.RevokeRequest,
      SignerPermissionActions.ReissueCertificate,
      SignerPermissionActions.RevokeCertificate,
      SignerPermissionActions.ExportCertificate
    ],
    SignerPermissionSub.Signer
  );

  return rules;
};

const buildSignerOperatorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<SignerPermissionSet>>(createMongoAbility);

  can(
    [
      SignerPermissionActions.Read,
      SignerPermissionActions.Sign,
      SignerPermissionActions.RequestSign,
      SignerPermissionActions.ExportCertificate
    ],
    SignerPermissionSub.Signer
  );

  return rules;
};

const buildSignerAuditorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<SignerPermissionSet>>(createMongoAbility);

  can([SignerPermissionActions.Read, SignerPermissionActions.ExportCertificate], SignerPermissionSub.Signer);

  return rules;
};

const buildProjectAdminSignerFallbackRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<SignerPermissionSet>>(createMongoAbility);

  can([SignerPermissionActions.Read, SignerPermissionActions.ManageMembers], SignerPermissionSub.Signer);

  return rules;
};

export const signerAdminPermissions = buildSignerAdminPermissionRules();
export const signerOperatorPermissions = buildSignerOperatorPermissionRules();
export const signerAuditorPermissions = buildSignerAuditorPermissionRules();
// What a project admin gets on a signer it holds no role on, and on top of the roles it holds.
export const projectAdminSignerFallbackPermissions = buildProjectAdminSignerFallbackRules();
