var mongoose = require('mongoose');

var botSchema = new mongoose.Schema(
	{
        name: {
            type: String,
            required: true
        },
        workspace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true
        },
        isActive: {
            type: Boolean,
            required: true,
            default: false
        },
        publicKey: {
            type: String,
            required: true
        },
        encryptedPrivateKey: {
            type: String,
            required: true,
            select: false
        },
        iv: {
            type: String,
            required: true,
            select: false
        },
        tag: {
            type: String,
            required: true,
            select: false
        },
        algorithm: { // the encryption algorithm used
            type: String,
            enum: ['aes-256-gcm'],
            required: true,
            select: false
        },
        keyEncoding: {
            type: String,
            enum: [
                'utf8',
                'base64'
            ],
            required: true,
            select: false
        }
	},
	{
		timestamps: true
	}
);

var Bot = mongoose.model('Bot', botSchema);

module.exports = Bot;
