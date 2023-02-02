import mongoose, { Schema, model } from 'mongoose';

const LoginSRPDetailSchema = new Schema(
	{
		clientPublicKey: {
			type: String,
			required: true
		},
		email: {
			type: String,
			required: true,
			unique: true
		},
		serverBInt: { type: mongoose.Schema.Types.Buffer },
		expireAt: { type: Date }
	}
);

const LoginSRPDetail = model('LoginSRPDetail', LoginSRPDetailSchema);

// LoginSRPDetailSchema.index({ "expireAt": 1 }, { expireAfterSeconds: 0 });

export default LoginSRPDetail;
