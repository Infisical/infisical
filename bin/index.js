#! /usr/bin/env node
const login = require('./actions/login');
const command = require('./command');
const {
	LOGIN
} = require('./variables');

const main = () => {
	const args = process.argv.slice(2);
	if (args.length < 1) {
		console.log("Error: Unrecognized command");
		process.exit(1);
	}
	
	command(args);
}

main();

