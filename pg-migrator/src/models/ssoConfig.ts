import { Schema, Types, model } from "mongoose";

export enum AuthProvider {
    OKTA_SAML = "okta-saml",
    AZURE_SAML = "azure-saml",
    JUMPCLOUD_SAML = "jumpcloud-saml"
}

export interface ISSOConfig {
    organization: Types.ObjectId;
    authProvider: AuthProvider;
    isActive: boolean;
    encryptedEntryPoint: string;
    entryPointIV: string;
    entryPointTag: string;
    encryptedIssuer: string;
    issuerIV: string;
    issuerTag: string;
    encryptedCert: string;
    certIV: string;
    certTag: string;
}

const ssoConfigSchema = new Schema<ISSOConfig>(
    {
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization"
        },
        authProvider: {
            type: String,
            enum: AuthProvider,
            required: true
        },
        isActive: {
            type: Boolean,
            required: true
        },
        encryptedEntryPoint: {
            type: String
        },
        entryPointIV: {
            type: String
        },
        entryPointTag: {
            type: String
        },
        encryptedIssuer: {
            type: String
        },
        issuerIV: {
            type: String
        },
        issuerTag: {
            type: String
        },
        encryptedCert: {
            type: String
        },
        certIV: {
            type: String
        },
        certTag: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

export const SSOConfig = model<ISSOConfig>("SSOConfig", ssoConfigSchema);