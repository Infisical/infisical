import { Schema, model, Types, Document } from 'mongoose';

export interface ITokenVersion extends Document {
    user: Types.ObjectId;
    name: string;
    refreshVersion: number;
    accessVersion: number;
}

const tokenVersionSchema = new Schema<ITokenVersion>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        refreshVersion: {
            type: Number,
            required: true
        },
        accessVersion: {
            type: Number,
            required: true
        }
    },
    {
        timestamps: true
    }
);

const TokenVersion = model<ITokenVersion>('TokenVersion', tokenVersionSchema);

export default TokenVersion;