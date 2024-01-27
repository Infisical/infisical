import { Schema, Types, model } from "mongoose";

export enum IPType {
    IPV4 = "ipv4",
    IPV6 = "ipv6"
}

export interface ITrustedIP {
    _id: Types.ObjectId;
    workspace: Types.ObjectId;
    ipAddress: string;
    type: "ipv4" | "ipv6", // either IPv4/IPv6 address or network IPv4/IPv6 address
    isActive: boolean;
    comment: string;
    prefix?: number; // CIDR
}

const trustedIpSchema = new Schema<ITrustedIP>(
    {
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true
        },
        ipAddress: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: [
                IPType.IPV4,
                IPType.IPV6
            ],
            required: true
        },
        prefix: {
            type: Number,
            required: false
        },
        isActive: {
            type: Boolean,
            required: true
        },
        comment: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

export const TrustedIP = model<ITrustedIP>("TrustedIP", trustedIpSchema);