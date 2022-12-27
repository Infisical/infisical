import { Schema, model, Types } from 'mongoose';

export interface ILog {
    _id: Types.ObjectId;
    user?: Types.ObjectId;
    workspace?: Types.ObjectId;
    actions: Types.ObjectId[];
    channel: string;
    ipAddress?: string;
}

const logSchema = new Schema<ILog>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace'
        },
        actions: [{
            type: Schema.Types.ObjectId,
            ref: 'Action'
        }],
        channel: { 
            type: String,
            enum: ['web', 'cli', 'auto'],
            required: true
        },
        ipAddress: {
            type: String
        }
    }, {
        timestamps: true
    }
);

const Log = model<ILog>('Log', logSchema);

export default Log;