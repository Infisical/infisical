const fs = require('fs');
const {
	connectToWorkspace
} = require('../api');
const {
	write
} = require('../utilities/file');


const connect = async ({
	workspaceId 
}) => {
	
	// check workspace connection
	await connectToWorkspace({ workspaceId });
	
	// create .env.infisical to store workspaceId
	await write({
		fileName: '.env.infisical',
		content: workspaceId
	});
	
	console.log('✅ Successfully established connection with workspace ' + workspaceId);
	process.exit(0);
}

module.exports = connect;
