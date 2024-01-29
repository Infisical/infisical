import { Document, Schema, Types, model } from "mongoose";

export enum AuthMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml"
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  authProvider?: AuthMethod;
  authMethods: AuthMethod[];
  email: string;
  superAdmin?: boolean;
  firstName?: string;
  lastName?: string;
  encryptionVersion: number;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  publicKey?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  tag?: string;
  salt?: string;
  verifier?: string;
  isMfaEnabled: boolean;
  mfaMethods: boolean;
  devices: {
    ip: string;
    userAgent: string;
  }[];
}

const userSchema = new Schema<IUser>(
  {
    authProvider: {
      // TODO field: deprecate
      type: String,
      enum: AuthMethod
    },
    authMethods: {
      type: [
        {
          type: String,
          enum: AuthMethod
        }
      ],
      default: [AuthMethod.EMAIL],
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    firstName: {
      type: String
    },
    lastName: {
      type: String
    },
    encryptionVersion: {
      type: Number,
      select: false,
      default: 1 // to resolve backward-compatibility issues
    },
    protectedKey: {
      // introduced as part of encryption version 2
      type: String,
      select: false
    },
    protectedKeyIV: {
      // introduced as part of encryption version 2
      type: String,
      select: false
    },
    protectedKeyTag: {
      // introduced as part of encryption version 2
      type: String,
      select: false
    },
    publicKey: {
      type: String,
      select: false
    },
    encryptedPrivateKey: {
      type: String,
      select: false
    },
    superAdmin: {
      type: Boolean
    },
    iv: {
      // iv of [encryptedPrivateKey]
      type: String,
      select: false
    },
    tag: {
      // tag of [encryptedPrivateKey]
      type: String,
      select: false
    },
    salt: {
      type: String,
      select: false
    },
    verifier: {
      type: String,
      select: false
    },
    isMfaEnabled: {
      type: Boolean,
      default: false
    },
    mfaMethods: [
      {
        type: String
      }
    ],
    devices: {
      type: [
        {
          ip: String,
          userAgent: String
        }
      ],
      default: [],
      select: false
    }
  },
  {
    timestamps: true
  }
);

export const User = model<IUser>("User", userSchema);
