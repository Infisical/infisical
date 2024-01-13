import { Schema, Types, model } from "mongoose";

export interface ILDAPConfig {
    organization: Types.ObjectId;
    isActive: boolean;
    url: string;
    encryptedBindDN: string;
    bindDNIV: string;
    bindDNTag: string;
    encryptedBindPass: string;
    bindPassIV: string;
    bindPassTag: string;
    searchBase: string;
    encryptedCACert: string;
    caCertIV: string;
    caCertTag: string;
}

const ldapConfigSchema = new Schema<ILDAPConfig>(
    {
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization"
        },
        isActive: {
            type: Boolean,
            required: true
        },
        url: {
            type: String,
            required: true
        },
        encryptedBindDN: {
            type: String,
            required: true
        },
        bindDNIV: {
            type: String,
            required: true
        },
        bindDNTag: {
            type: String,
            required: true
        },
        encryptedBindPass: {
            type: String,
            required: true
        },
        bindPassIV: {
            type: String,
            required: true
        },
        bindPassTag: {
            type: String,
            required: true
        },
        searchBase: {
            type: String,
            required: true
        },
        encryptedCACert: {
            type: String,
            required: true
        },
        caCertIV: {
            type: String,
            required: true
        },
        caCertTag: {
            type: String,
            required: true
        },
    },
    {
        timestamps: true
    }
);

export const LDAPConfig = model<ILDAPConfig>("LDAPConfig", ldapConfigSchema);