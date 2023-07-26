import { Schema, Types, model } from "mongoose";
import {
    ACTION_ADD_SECRETS,
    ACTION_DELETE_SECRETS,
    ACTION_LOGIN,
    ACTION_LOGOUT,
    ACTION_READ_SECRETS,
    ACTION_UPDATE_SECRETS,
} from "../../variables";

export interface IAction {
    name: string;
    user?: Types.ObjectId,
    serviceAccount?: Types.ObjectId,
    serviceTokenData?: Types.ObjectId,
    workspace?: Types.ObjectId,
    payload?: {
        secretVersions?: Types.ObjectId[]
    }
}

const actionSchema = new Schema<IAction>(
    {
        name: {
            type: String,
            required: true,
            enum: [
                ACTION_LOGIN,
                ACTION_LOGOUT,
                ACTION_ADD_SECRETS,
                ACTION_UPDATE_SECRETS,
                ACTION_READ_SECRETS,
                ACTION_DELETE_SECRETS,
            ],
        },
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
        payload: {
            secretVersions: [{
                oldSecretVersion: {
                    type: Schema.Types.ObjectId,
                    ref: "SecretVersion",
                },
                newSecretVersion: {
                    type: Schema.Types.ObjectId,
                    ref: "SecretVersion",
                },
            }],
        },
    }, {
        timestamps: true,
    }
);

export const Action = model<IAction>("Action", actionSchema);