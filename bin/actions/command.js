#! /usr/bin/env node
const {
	INIT,
	CONNECT,
	LOGOUT,
	PUSH,
	PULL
} = require('../variables');
const logout = require('./logout');
const push = require('./push');
const pull = require('./pull');
const connect = require('./connect');

/**
 * Process post-login user input
 * 
*/
const command = async (args) => {
	switch (args[0]) {
		case INIT:
			console.log('INIT');
			break;
		case CONNECT:
			if (args.length < 2) {
				console.log('Connecting requires you to pass in a workspace id');
				process.exit(1)	;
			}
			await connect({
				workspaceId: args[1]
			});
			break;
		case LOGOUT:
			logout();
			console.log('LOGOUT');
			break;
		case PUSH:
			push();
			break;
		case PULL:
			pull();
			break;
		default:
			console.log("Unrecognized command");
			return;
	}

}

module.exports = command;
