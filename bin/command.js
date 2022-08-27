const {
	LOGIN,
	CONNECT,
	PUSH,
	PULL
} = require('./variables');
const login = require('./actions/login');
const { push, push2 } = require('./actions/push');
const { pull, pull2 } = require('./actions/pull');
const connect = require('./actions/connect');

// TODO: validate authentication + membership first

/**
 * Process post-login user input
 * 
*/
const command = async (args) => {
	switch (args[0]) {
		case LOGIN:
			login();
			break;
		case CONNECT:
			if (args.length < 2) {
				console.error("Error: Invalid command format should be 'npx infisical connect [workspaceId]'");
				process.exit(1)	;
			}
			connect({
				workspaceId: args[1]
			});
			break;
		case PUSH:
			push();
			break;
		case PULL:
			pull();
			break;
		case "push2":
			push2();
			break;
		case "pull2":
			pull2();
			break;
		default:
			console.log("❌ Error: Command not recognized");
			return;
	}

}

module.exports = command;
