import { Schema, model, Types, Document } from 'mongoose';

export interface IPermission extends Document {
    _id: Types.ObjectId;
    name: string;
}

const permissionSchema = new Schema<IPermission>(
    {
        name: {
            type: String,
            required: true
        }
    },
    {
        timestamps: true
    }
);

const Permission = model<IPermission>('Permission', permissionSchema);

export default Permission;