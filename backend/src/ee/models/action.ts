import { Schema, model, Types } from 'mongoose';

export interface IAction {
    name: string;
    user?: Types.ObjectId,
    workspace?: Types.ObjectId,
    payload: {
        secretVersions?: Types.ObjectId[]
    }
}

const actionSchema = new Schema<IAction>(
    {
        name: {
            type: String,
            required: true
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace'
        },
        payload: {
            secretVersions: [{
                oldSecretVersion: {
                    type: Schema.Types.ObjectId,
                    ref: 'SecretVersion'
                },
                newSecretVersion: {
                    type: Schema.Types.ObjectId,
                    ref: 'SecretVersion'
                }
            }]
        }
    }, {
        timestamps: true
    }
);

const Action = model<IAction>('Action', actionSchema);

export default Action;