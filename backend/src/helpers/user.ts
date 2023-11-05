import { Types } from "mongoose";
import {
  APIKeyData, 
  BackupPrivateKey,
  IUser,
  Key,
  Membership,
  MembershipOrg,
  TokenVersion,
  User,
  UserAction
} from "../models";
import { sendMail } from "./nodemailer";
import {
  InternalServerError,
  ResourceNotFoundError
} from "../utils/errors";
import { ADMIN } from "../variables";
import { deleteOrganization } from "../helpers/organization";
import { deleteWorkspace } from "../helpers/workspace";

/**
 * Initialize a user under email [email]
 * @param {Object} obj
 * @param {String} obj.email - email of user to initialize
 * @returns {Object} user - the initialized user
 */
export const setupAccount = async ({ email }: { email: string }) => {
  const user = await new User({
    email
  }).save();

  return user;
};

/**
 * Finish setting up user
 * @param {Object} obj
 * @param {String} obj.userId - id of user to finish setting up
 * @param {String} obj.firstName - first name of user
 * @param {String} obj.lastName - last name of user
 * @param {Number} obj.encryptionVersion - version of auth encryption scheme used
 * @param {String} obj.protectedKey - protected key in encryption version 2
 * @param {String} obj.protectedKeyIV - IV of protected key in encryption version 2
 * @param {String} obj.protectedKeyTag - tag of protected key in encryption version 2
 * @param {String} obj.publicKey - publickey of user
 * @param {String} obj.encryptedPrivateKey - (encrypted) private key of user
 * @param {String} obj.encryptedPrivateKeyIV - iv for (encrypted) private key of user
 * @param {String} obj.encryptedPrivateKeyTag - tag for (encrypted) private key of user
 * @param {String} obj.salt - salt for auth SRP
 * @param {String} obj.verifier - verifier for auth SRP
 * @returns {Object} user - the completed user
 */
export const completeAccount = async ({
  userId,
  firstName,
  lastName,
  encryptionVersion,
  protectedKey,
  protectedKeyIV,
  protectedKeyTag,
  publicKey,
  encryptedPrivateKey,
  encryptedPrivateKeyIV,
  encryptedPrivateKeyTag,
  salt,
  verifier
}: {
  userId: string;
  firstName: string;
  lastName?: string;
  encryptionVersion: number;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  publicKey: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
}) => {
  const options = {
    new: true
  };
  const user = await User.findByIdAndUpdate(
    userId,
    {
      firstName,
      lastName,
      encryptionVersion,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      publicKey,
      encryptedPrivateKey,
      iv: encryptedPrivateKeyIV,
      tag: encryptedPrivateKeyTag,
      salt,
      verifier
    },
    options
  );

  return user;
};

/**
 * Check if device with ip [ip] and user-agent [userAgent] has been seen for user [user].
 * If the device is unseen, then notify the user of the new device
 * @param {Object} obj
 * @param {String} obj.ip - login ip address
 * @param {String} obj.userAgent - login user-agent
 */
export const checkUserDevice = async ({
  user,
  ip,
  userAgent
}: {
  user: IUser;
  ip: string;
  userAgent: string;
}) => {
  const isDeviceSeen = user.devices.some(
    (device) => device.ip === ip && device.userAgent === userAgent
  );

  if (!isDeviceSeen) {
    // case: unseen login ip detected for user
    // -> notify user about the sign-in from new ip

    user.devices = user.devices.concat([
      {
        ip: String(ip),
        userAgent
      }
    ]);

    await user.save();

    // send MFA code [code] to [email]
    await sendMail({
      template: "newDevice.handlebars",
      subjectLine: "Successful login from new device",
      recipients: [user.email],
      substitutions: {
        email: user.email,
        timestamp: new Date().toString(),
        ip,
        userAgent
      }
    });
  }
};

/**
 * Check that if we delete user with id [userId] then
 * there won't be any admin-less organizations or projects
 * @param {Object} obj
 * @param {String} obj.userId - id of user to check deletion conditions for
 */
const checkDeleteUserConditions = async ({
  userId
}: {
  userId: Types.ObjectId;
}) => {
  const memberships = await Membership.find({
    user: userId
  });

  const membershipOrgs = await MembershipOrg.find({
    user: userId
  });

  // delete organizations where user is only member
  for await (const membershipOrg of membershipOrgs) {
    const orgMemberCount = await MembershipOrg.countDocuments({
      organization: membershipOrg.organization,
    });
    
    const otherOrgAdminCount = await MembershipOrg.countDocuments({
      organization: membershipOrg.organization,
      user: { $ne: userId },
      role: ADMIN
    });

    if (orgMemberCount > 1 && otherOrgAdminCount === 0) {
      throw InternalServerError({
        message: "Failed to delete account because an org would be admin-less"
      });
    }
  }

  // delete workspaces where user is only member
  for await (const membership of memberships) {
    const workspaceMemberCount = await Membership.countDocuments({
      workspace: membership.workspace
    });
    
    const otherWorkspaceAdminCount = await Membership.countDocuments({
      workspace: membership.workspace,
      user: { $ne: userId },
      role: ADMIN
    });

    if (workspaceMemberCount > 1 && otherWorkspaceAdminCount === 0) {
      throw InternalServerError({
        message: "Failed to delete account because a workspace would be admin-less"
      });
    }
  }
}

/**
 * Delete account with id [userId]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.userId - id of user to delete
 * @returns {User} user - deleted user
 */
export const deleteUser = async ({
  userId
}: {
  userId: Types.ObjectId;
}) => {

  const user = await User.findByIdAndDelete(userId);
  
  if (!user) throw ResourceNotFoundError();

  await checkDeleteUserConditions({
    userId: user._id
  });
  
  await UserAction.deleteMany({
    user: user._id
  });

  await BackupPrivateKey.deleteMany({
    user: user._id
  });

  await APIKeyData.deleteMany({
    user: user._id
  });

  await TokenVersion.deleteMany({
    user: user._id
  });

  await Key.deleteMany({
    receiver: user._id
  });

  const membershipOrgs = await MembershipOrg.find({
    user: userId
  });

  // delete organizations where user is only member
  for await (const membershipOrg of membershipOrgs) {
    const memberCount = await MembershipOrg.countDocuments({
      organization: membershipOrg.organization
    });
    
    if (memberCount === 1) {
      // organization only has 1 member (the current user)

      await deleteOrganization({
        organizationId: membershipOrg.organization
      });
    }
  }

  const memberships = await Membership.find({
    user: userId
  });

  // delete workspaces where user is only member
  for await (const membership of memberships) {
    const memberCount = await Membership.countDocuments({
      workspace: membership.workspace
    });
    
    if (memberCount === 1) {
      // workspace only has 1 member (the current user) -> delete workspace

      await deleteWorkspace({
        workspaceId: membership.workspace
      });
    }
  }
  
  await MembershipOrg.deleteMany({
    user: userId
  });
  
  await Membership.deleteMany({
    user: userId
  });

  return user;
}