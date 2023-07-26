import { Schema, Types, model } from "mongoose";
import {
    ACTION_ADD_SECRETS,
    ACTION_DELETE_SECRETS,
    ACTION_LOGIN,
    ACTION_LOGOUT,
    ACTION_READ_SECRETS,
    ACTION_UPDATE_SECRETS,
} from "../../variables";

export interface ILog {
    _id: Types.ObjectId;
    user?: Types.ObjectId;
    serviceAccount?: Types.ObjectId;
    serviceTokenData?: Types.ObjectId;
    workspace?: Types.ObjectId;
    actionNames: string[];
    actions: Types.ObjectId[];
    channel: string;
    ipAddress?: string;
}

const logSchema = new Schema<ILog>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        serviceAccount: {
            type: Schema.Types.ObjectId,
            ref: "ServiceAccount",
        },
        serviceTokenData: {
            type: Schema.Types.ObjectId,
            ref: "ServiceTokenData",
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
        },
        actionNames: {
            type: [String],
            enum: [
                ACTION_LOGIN,
                ACTION_LOGOUT,
                ACTION_ADD_SECRETS,
                ACTION_UPDATE_SECRETS,
                ACTION_READ_SECRETS,
                ACTION_DELETE_SECRETS,
            ],
            required: true,
        },
        actions: [{
            type: Schema.Types.ObjectId,
            ref: "Action",
            required: true,
        }],
        channel: {
            type: String,
            enum: ["web", "cli", "auto", "k8-operator", "other"],
            required: true,
        },
        ipAddress: {
            type: String,
        },
    }, 
    {
        timestamps: true,
    }
);

export const Log = model<ILog>("Log", logSchema);