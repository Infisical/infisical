import { Schema, model, Types } from 'mongoose';

export interface ISecretSnapshot {
    workspace: Types.ObjectId;
    version: number;
    secretVersions: Types.ObjectId[];
}

const secretSnapshotSchema = new Schema<ISecretSnapshot>(
    {
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true
        },
        version: {
            type: Number,
            required: true
        },
        secretVersions: [{
            type: Schema.Types.ObjectId,
            ref: 'SecretVersion',
            required: true
        }]
    },
    {
        timestamps: true
    }
);

const SecretSnapshot = model<ISecretSnapshot>('SecretSnapshot', secretSnapshotSchema);

export default SecretSnapshot;