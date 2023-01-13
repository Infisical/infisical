const secretSchema = {
    _id: {
        type: 'string',
        format: 'objectId'
    },
    version: {
        type: 'number'
    }
}

module.exports = secretSchema;