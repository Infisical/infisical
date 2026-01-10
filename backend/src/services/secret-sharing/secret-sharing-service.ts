import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope, TSecretSharing } from "@app/db/schemas";
import { OrgPermissionSecretShareAction, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor, SecretSharingAccessType } from "@app/lib/types";
import { isUuidV4 } from "@app/lib/validator";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TOrgDALFactory } from "../org/org-dal";
import { TSecretShareBrandConfig } from "../org/org-types";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TSecretShareBrandingAssetDALFactory } from "./secret-share-branding-asset-dal";
import { TSecretSharingDALFactory } from "./secret-sharing-dal";
import {
  SecretSharingType,
  TCreatePublicSharedSecretDTO,
  TCreateSecretRequestDTO,
  TCreateSharedSecretDTO,
  TDeleteSharedSecretDTO,
  TGetActiveSharedSecretByIdDTO,
  TGetSecretRequestByIdDTO,
  TGetSharedSecretsDTO,
  TRevealSecretRequestValueDTO,
  TSetSecretRequestValueDTO
} from "./secret-sharing-types";

type TSecretSharingServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  secretSharingDAL: TSecretSharingDALFactory;
  secretShareBrandingAssetDAL: TSecretShareBrandingAssetDALFactory;
  orgDAL: TOrgDALFactory;
  userDAL: TUserDALFactory;
  kmsService: TKmsServiceFactory;
  smtpService: TSmtpService;
};

export type TSecretSharingServiceFactory = ReturnType<typeof secretSharingServiceFactory>;

export const secretSharingServiceFactory = ({
  permissionService,
  secretSharingDAL,
  secretShareBrandingAssetDAL,
  orgDAL,
  kmsService,
  smtpService,
  userDAL
}: TSecretSharingServiceFactoryDep) => {
  const $validateSharedSecretExpiry = (expiresAt: string) => {
    if (new Date(expiresAt) < new Date()) {
      throw new BadRequestError({ message: "Expiration date cannot be in the past" });
    }

    // Limit Expiry Time to 1 month
    const expiryTime = new Date(expiresAt).getTime();
    const currentTime = new Date().getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (expiryTime - currentTime > thirtyDays) {
      throw new BadRequestError({ message: "Expiration date cannot be more than 30 days" });
    }

    const fiveMins = 5 * 60 * 1000;

    // 1 second buffer
    if (expiryTime - currentTime + 1000 < fiveMins) {
      throw new BadRequestError({ message: "Expiration time cannot be less than 5 mins" });
    }
  };

  const createSharedSecret = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    secretValue,
    name,
    password,
    accessType,
    expiresAt,
    expiresAfterViews,
    emails
  }: TCreateSharedSecretDTO) => {
    const appCfg = getConfig();

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });
    $validateSharedSecretExpiry(expiresAt);

    const rootOrg = await orgDAL.findRootOrgDetails(orgId);
    if (!rootOrg) throw new BadRequestError({ message: `Organization with id  ${orgId} not found` });

    if (!rootOrg.allowSecretSharingOutsideOrganization && accessType === SecretSharingAccessType.Anyone) {
      throw new BadRequestError({
        message: "Organization does not allow sharing secrets to members outside of this organization"
      });
    }

    if (secretValue.length > 10_000) {
      throw new BadRequestError({ message: "Shared secret value too long" });
    }

    // Check lifetime is within org allowance
    const expiresAtTimestamp = new Date(expiresAt).getTime();
    const lifetime = expiresAtTimestamp - new Date().getTime();

    // rootOrg.maxSharedSecretLifetime is in seconds
    if (rootOrg.maxSharedSecretLifetime && lifetime / 1000 > rootOrg.maxSharedSecretLifetime) {
      throw new BadRequestError({ message: "Secret lifetime exceeds organization limit" });
    }

    // Check max view count is within org allowance
    if (
      rootOrg.maxSharedSecretViewLimit &&
      (!expiresAfterViews || expiresAfterViews > rootOrg.maxSharedSecretViewLimit)
    ) {
      throw new BadRequestError({ message: "Secret max views parameter exceeds organization limit" });
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();

    const orgEmails = [];

    if (emails && emails.length > 0) {
      const allOrgMembers = await orgDAL.findAllOrgMembers(orgId);

      // Check to see that all emails are a part of the organization (if enforced) while also collecting a list of emails which are in the org
      for (const email of emails) {
        if (allOrgMembers.some((v) => v.user.email === email)) {
          orgEmails.push(email);
          // If the email is not part of the org, but access type / org settings require it
        } else if (
          !rootOrg.allowSecretSharingOutsideOrganization ||
          accessType === SecretSharingAccessType.Organization
        ) {
          throw new BadRequestError({
            message: "Organization does not allow sharing secrets to members outside of this organization"
          });
        }
      }
    }

    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const id = crypto.randomBytes(32).toString("hex");
    const hashedPassword = password ? await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS) : null;

    const newSharedSecret = await secretSharingDAL.create({
      identifier: id,
      iv: null,
      tag: null,
      encryptedValue: null,
      encryptedSecret,
      name,
      type: SecretSharingType.Share,
      password: hashedPassword,
      expiresAt: new Date(expiresAt),
      expiresAfterViews,
      userId: actorId,
      orgId,
      accessType,
      authorizedEmails: emails && emails.length > 0 ? JSON.stringify(emails) : undefined
    });

    const idToReturn = `${Buffer.from(newSharedSecret.identifier!, "hex").toString("base64url")}`;

    // Loop through recipients and send out emails with unique access links
    if (emails) {
      const user = await userDAL.findById(actorId);

      if (!user) {
        throw new NotFoundError({ message: `User with ID '${actorId}' not found` });
      }

      for await (const email of emails) {
        try {
          // Only show the username to emails which are part of the organization
          const respondentUsername = orgEmails.includes(email) ? user.username : undefined;

          await smtpService.sendMail({
            recipients: [email],
            subjectLine: "A secret has been shared with you",
            substitutions: {
              name,
              respondentUsername,
              secretRequestUrl: `${appCfg.SITE_URL}/shared/secret/${idToReturn}`
            },
            template: SmtpTemplates.SecretRequestCompleted
          });
        } catch (e) {
          logger.error(e, "Failed to send shared secret URL to a recipient's email.");
        }
      }
    }

    return { id: idToReturn };
  };

  const createSecretRequest = async ({
    actor,
    accessType,
    expiresAt,
    name,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TCreateSecretRequestDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

    $validateSharedSecretExpiry(expiresAt);

    const newSecretRequest = await secretSharingDAL.create({
      type: SecretSharingType.Request,
      userId: actorId,
      orgId,
      name,
      encryptedSecret: null,
      accessType,
      expiresAt: new Date(expiresAt)
    });

    return { id: newSecretRequest.id };
  };

  const revealSecretRequestValue = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    orgId,
    actorAuthMethod
  }: TRevealSecretRequestValueDTO) => {
    const secretRequest = await secretSharingDAL.getSecretRequestById(id);

    if (!secretRequest) {
      throw new NotFoundError({ message: `Secret request with ID '${id}' not found` });
    }

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

    if (secretRequest.userId !== actorId || secretRequest.orgId !== orgId) {
      throw new ForbiddenRequestError({ name: "User does not have permission to access this secret request" });
    }

    if (!secretRequest.encryptedSecret) {
      throw new BadRequestError({ message: "Secret request has no value set" });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const decryptedSecret = decryptWithRoot(secretRequest.encryptedSecret);

    return { ...secretRequest, secretValue: decryptedSecret.toString() };
  };

  const getSecretRequestById = async ({
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSecretRequestByIdDTO) => {
    const secretRequest = await secretSharingDAL.getSecretRequestById(id);

    if (!secretRequest) {
      throw new NotFoundError({ message: `Secret request with ID '${id}' not found` });
    }

    if (secretRequest.accessType === SecretSharingAccessType.Organization) {
      if (!secretRequest.orgId) {
        throw new BadRequestError({ message: "No organization ID present on secret request" });
      }

      if (!actorOrgId) {
        throw new UnauthorizedError();
      }

      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: secretRequest.orgId,
        actorAuthMethod,
        actorOrgId
      });
      if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });
    }

    if (secretRequest.expiresAt && secretRequest.expiresAt < new Date()) {
      return {
        requestOrgId: secretRequest.orgId,
        error: "Secret request has expired",
        isSecretValueSet: false
      };
    }

    return {
      request: secretRequest,
      requestOrgId: secretRequest.orgId,
      isSecretValueSet: Boolean(secretRequest.encryptedSecret)
    };
  };

  const getSecretRequestOrgId = async (secretRequestId: string) => {
    const secretRequest = await secretSharingDAL.getSecretRequestById(secretRequestId);
    return secretRequest?.orgId ?? null;
  };

  const setSecretRequestValue = async ({
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    secretValue
  }: TSetSecretRequestValueDTO) => {
    const appCfg = getConfig();

    const secretRequest = await secretSharingDAL.getSecretRequestById(id);

    if (!secretRequest) {
      throw new NotFoundError({ message: `Secret request with ID '${id}' not found` });
    }

    let respondentUsername: string | undefined;

    if (secretRequest.accessType === SecretSharingAccessType.Organization) {
      if (!secretRequest.orgId) {
        throw new BadRequestError({ message: "No organization ID present on secret request" });
      }

      if (!actorOrgId) {
        throw new UnauthorizedError();
      }

      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: secretRequest.orgId,
        actorAuthMethod,
        actorOrgId
      });
      if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

      const user = await userDAL.findById(actorId);

      if (!user) {
        throw new NotFoundError({ message: `User with ID '${actorId}' not found` });
      }

      respondentUsername = user.username;
    }

    if (secretRequest.encryptedSecret) {
      throw new BadRequestError({ message: "Secret request already has a value set" });
    }

    if (secretValue.length > 10_000) {
      throw new BadRequestError({ message: "Shared secret value too long" });
    }

    if (secretRequest.expiresAt && secretRequest.expiresAt < new Date()) {
      throw new ForbiddenRequestError({
        message: "Access denied: Secret request has expired"
      });
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const request = await secretSharingDAL.transaction(async (tx) => {
      const updatedRequest = await secretSharingDAL.updateById(id, { encryptedSecret }, tx);

      await smtpService.sendMail({
        recipients: [secretRequest.requesterUsername],
        subjectLine: "Secret Request Completed",
        substitutions: {
          name: secretRequest.name,
          respondentUsername,
          secretRequestUrl: `${appCfg.SITE_URL}/organizations/${secretRequest.orgId}/secret-sharing?selectedTab=request-secret`
        },
        template: SmtpTemplates.SecretRequestCompleted
      });

      return updatedRequest;
    });

    return request;
  };

  const createPublicSharedSecret = async ({
    password,
    secretValue,
    expiresAt,
    expiresAfterViews,
    accessType
  }: TCreatePublicSharedSecretDTO) => {
    $validateSharedSecretExpiry(expiresAt);

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const appCfg = getConfig();

    const id = crypto.randomBytes(32).toString("hex");
    const hashedPassword = password ? await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS) : null;

    const newSharedSecret = await secretSharingDAL.create({
      identifier: id,
      encryptedValue: null,
      iv: null,
      tag: null,
      type: SecretSharingType.Share,
      encryptedSecret,
      password: hashedPassword,
      expiresAt: new Date(expiresAt),
      expiresAfterViews,
      accessType
    });

    return { id: `${Buffer.from(newSharedSecret.identifier!, "hex").toString("base64url")}` };
  };

  const getSharedSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset,
    limit,
    type
  }: TGetSharedSecretsDTO) => {
    if (!actorOrgId) throw new ForbiddenRequestError();

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const secrets = await secretSharingDAL.find(
      {
        userId: actorId,
        orgId: actorOrgId,
        type
      },
      { offset, limit, sort: [["createdAt", "desc"]] }
    );

    const count = await secretSharingDAL.countAllUserOrgSharedSecrets({
      orgId: actorOrgId,
      userId: actorId,
      type
    });

    return {
      secrets,
      totalCount: count
    };
  };

  const $decrementSecretViewCount = async (sharedSecret: TSecretSharing) => {
    const { expiresAfterViews } = sharedSecret;

    if (expiresAfterViews) {
      // decrement view count if view count expiry set
      await secretSharingDAL.updateById(sharedSecret.id, { $decr: { expiresAfterViews: 1 } });
    }

    await secretSharingDAL.updateById(sharedSecret.id, {
      lastViewedAt: new Date()
    });
  };

  /** Gets password-less secret. validates all secret's requested (must be fresh). */
  const getSharedSecretById = async ({
    sharedSecretId,
    hashedHex,
    orgId,
    actorId,
    password
  }: TGetActiveSharedSecretByIdDTO) => {
    const sharedSecret = isUuidV4(sharedSecretId)
      ? await secretSharingDAL.findOne({
          id: sharedSecretId,
          type: SecretSharingType.Share,
          hashedHex
        })
      : await secretSharingDAL.findOne({
          type: SecretSharingType.Share,
          identifier: Buffer.from(sharedSecretId, "base64url").toString("hex")
        });

    if (!sharedSecret)
      throw new NotFoundError({
        message: `Shared secret with ID '${sharedSecretId}' not found`
      });

    const { accessType, expiresAt, expiresAfterViews } = sharedSecret;

    const orgName = sharedSecret.orgId ? (await orgDAL.findOrgById(sharedSecret.orgId))?.name : "";

    if (accessType === SecretSharingAccessType.Organization && orgId === undefined) {
      throw new UnauthorizedError();
    }

    if (accessType === SecretSharingAccessType.Organization && orgId !== sharedSecret.orgId) {
      throw new ForbiddenRequestError();
    }

    // If the secret was shared with specific emails, verify that the current user's session email is authorized
    if (sharedSecret.authorizedEmails && (sharedSecret.authorizedEmails as string[]).length > 0) {
      if (!actorId) throw new UnauthorizedError();

      const user = await userDAL.findById(actorId);
      if (!user || !user.email) throw new UnauthorizedError();

      if (!(sharedSecret.authorizedEmails as string[]).includes(user.email))
        return {
          isPasswordProtected: false,
          secretOrgId: sharedSecret.orgId,
          error: "Email not authorized to view secret"
        };
    }

    // all secrets pass through here, meaning we check if its expired first and then check if it needs verification
    // or can be safely sent to the client.
    if (expiresAt !== null && expiresAt < new Date()) {
      // check lifetime expiry
      await secretSharingDAL.softDeleteById(sharedSecret.id);
      return {
        isPasswordProtected: false,
        secretOrgId: sharedSecret.orgId,
        error: "Secret lifetime has expired"
      };
    }

    if (expiresAfterViews !== null && expiresAfterViews === 0) {
      // check view count expiry
      await secretSharingDAL.softDeleteById(sharedSecret.id);
      return {
        isPasswordProtected: false,
        secretOrgId: sharedSecret.orgId,
        error: "Secret has expired by view count"
      };
    }

    // Password checks
    const isPasswordProtected = Boolean(sharedSecret.password);
    const hasProvidedPassword = Boolean(password);
    if (isPasswordProtected) {
      if (hasProvidedPassword) {
        const isMatch = await crypto.hashing().compareHash(password as string, sharedSecret.password as string);
        if (!isMatch) throw new UnauthorizedError({ message: "Invalid credentials" });
      } else {
        return { isPasswordProtected, secretOrgId: sharedSecret.orgId };
      }
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();

    // If encryptedSecret is set, we know that this secret has been encrypted using KMS, and we can therefore do server-side decryption.
    let decryptedSecretValue: Buffer | undefined;
    if (sharedSecret.encryptedSecret) {
      decryptedSecretValue = decryptWithRoot(sharedSecret.encryptedSecret);
    }

    // decrement when we are sure the user will view secret.
    await $decrementSecretViewCount(sharedSecret);

    return {
      isPasswordProtected,
      secretOrgId: sharedSecret.orgId,
      secret: {
        ...sharedSecret,
        ...(decryptedSecretValue && {
          secretValue: decryptedSecretValue.toString()
        }),
        orgName:
          sharedSecret.accessType === SecretSharingAccessType.Organization && orgId === sharedSecret.orgId
            ? orgName
            : undefined
      }
    };
  };

  const deleteSharedSecretById = async (deleteSharedSecretInput: TDeleteSharedSecretDTO) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId, sharedSecretId } = deleteSharedSecretInput;
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const sharedSecret = isUuidV4(sharedSecretId)
      ? await secretSharingDAL.findOne({ id: sharedSecretId, type: deleteSharedSecretInput.type })
      : await secretSharingDAL.findOne({
          identifier: Buffer.from(sharedSecretId, "base64url").toString("hex"),
          type: deleteSharedSecretInput.type
        });

    if (sharedSecret.userId !== actorId) {
      throw new ForbiddenRequestError({
        message: "User does not have permission to delete shared secret"
      });
    }
    if (sharedSecret.orgId && sharedSecret.orgId !== orgId) {
      throw new ForbiddenRequestError({ message: "User does not have permission to delete shared secret" });
    }

    const deletedSharedSecret = await secretSharingDAL.deleteById(sharedSecret.id);

    return deletedSharedSecret;
  };

  const getSharedSecretOrgId = async (sharedSecretId: string) => {
    const sharedSecret = isUuidV4(sharedSecretId)
      ? await secretSharingDAL.findOne({
          id: sharedSecretId,
          type: SecretSharingType.Share
        })
      : await secretSharingDAL.findOne({
          identifier: Buffer.from(sharedSecretId, "base64url").toString("hex"),
          type: SecretSharingType.Share
        });

    return sharedSecret?.orgId ?? null;
  };

  const getOrgBrandConfig = async (orgId: string, actor?: OrgServiceActor) => {
    // When accessed via public endpoint (from shared secret), don't check permission
    if (actor) {
      const { permission } = await permissionService.getOrgPermission({
        actor: actor.type,
        actorId: actor.id,
        orgId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        scope: OrganizationActionScope.ParentOrganization
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionSecretShareAction.ManageSettings,
        OrgPermissionSubjects.SecretShare
      );
    }

    const org = await orgDAL.findOrgById(orgId);
    const assets = await secretShareBrandingAssetDAL.findAllByOrgId(orgId);

    const hasLogo = assets.some((a) => a.assetType === "logo");
    const hasFavicon = assets.some((a) => a.assetType === "favicon");

    const config = org?.secretShareBrandConfig as TSecretShareBrandConfig;

    if (!config && !hasLogo && !hasFavicon) {
      return null;
    }

    return {
      hasLogo,
      hasFavicon,
      primaryColor: config?.primaryColor,
      secondaryColor: config?.secondaryColor
    };
  };

  const getBrandingAsset = async (orgId: string, assetType: string, actor?: OrgServiceActor) => {
    // When accessed via public endpoint (from shared secret), don't check permission
    if (actor) {
      const { permission } = await permissionService.getOrgPermission({
        actor: actor.type,
        actorId: actor.id,
        orgId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        scope: OrganizationActionScope.ParentOrganization
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionSecretShareAction.ManageSettings,
        OrgPermissionSubjects.SecretShare
      );
    }

    const asset = await secretShareBrandingAssetDAL.findByOrgIdAndType(orgId, assetType);
    return asset;
  };

  const uploadBrandingAsset = async (
    orgId: string,
    assetType: string,
    data: Buffer,
    contentType: string,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretShareAction.ManageSettings,
      OrgPermissionSubjects.SecretShare
    );

    const size = data.length;
    return secretShareBrandingAssetDAL.upsert(orgId, assetType, data, contentType, size);
  };

  const deleteBrandingAsset = async (orgId: string, assetType: string, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretShareAction.ManageSettings,
      OrgPermissionSubjects.SecretShare
    );

    await secretShareBrandingAssetDAL.deleteByOrgIdAndType(orgId, assetType);
  };

  return {
    createSharedSecret,
    createPublicSharedSecret,
    getSharedSecrets,
    deleteSharedSecretById,
    getSharedSecretById,
    getSharedSecretOrgId,
    getOrgBrandConfig,
    getBrandingAsset,
    uploadBrandingAsset,
    deleteBrandingAsset,

    createSecretRequest,
    getSecretRequestById,
    getSecretRequestOrgId,
    setSecretRequestValue,
    revealSecretRequestValue
  };
};
