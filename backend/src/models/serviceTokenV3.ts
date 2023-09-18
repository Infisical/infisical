import { Document, Schema, Types, model } from "mongoose";

export interface IServiceTokenV3 extends Document {
    _id: Types.ObjectId;
    name: string;
    workspace: Types.ObjectId;
    publicKey: string;
}

const serviceTokenV3Schema = new Schema(
    {
        name: {
            type: String,
            required: true
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true
        },
        publicKey: {
            type: String,
            required: true
        }
    }
);

export const ServiceTokenV3 = model<IServiceTokenV3>("ServiceTokenV3", serviceTokenV3Schema);