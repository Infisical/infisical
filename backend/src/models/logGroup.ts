import { Schema, model, Types } from 'mongoose';

export interface ILogGroup {
    workspace: Types.ObjectId,
    logs: [Types.ObjectId]
}

const logGroupSchema = new Schema<ILogGroup>(
    {
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace'
        },
        logs: [{
            type: Schema.Types.ObjectId,
            ref: 'Log'
        }]
    }, {
        timestamps: true
    }
);

const LogGroup = model<ILogGroup>('LogGroup', logGroupSchema);

export default LogGroup;