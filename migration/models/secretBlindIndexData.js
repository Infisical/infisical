var mongoose = require('mongoose');

var secretBlindIndexDataSchema = new mongoose.Schema(
    {
        workspace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Workspace',
            required: true
        },
        encryptedSaltCiphertext:{
            type: String,
            required: true
        },
        saltIV: {
            type: String,
            required: true
        },
        saltTag: {
            type: String,
            required: true
        },
        algorithm: {
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

    }
);

var SecretBlindIndexData = mongoose.model('SecretBlindIndexData', secretBlindIndexDataSchema);

module.exports = SecretBlindIndexData;