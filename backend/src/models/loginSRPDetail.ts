import mongoose, { Schema, model, Types } from 'mongoose';

export interface ILoginSRPDetail {
	_id: Types.ObjectId;
	clientPublicKey: string;
	email: string;
	serverBInt: mongoose.Schema.Types.Buffer;
	userId: string;
	expireAt: Date;
}

const loginSRPDetailSchema = new Schema<ILoginSRPDetail>(
	{
		clientPublicKey: {
			type: String,
			required: true
		},
		email: {
			type: String,
			unique: true
		},
		serverBInt: { type: mongoose.Schema.Types.Buffer },
		expireAt: { type: Date }
	}
);

const LoginSRPDetail = model('LoginSRPDetail', loginSRPDetailSchema);

export default LoginSRPDetail;
