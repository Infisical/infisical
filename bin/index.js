#! /usr/bin/env node
const auth = require('./utilities/auth');
const login = require('./actions/login');
const command = require('./actions/command');
const open = require('open');
const {
	LOGIN
} = require('./variables');

const currentPath = process.cwd();
const args = process.argv.slice(2);

const main = () => {
	if (args.length < 1) {
		console.log("Unrecognized command.");
		process.exit(1);
	}
	
	if (args[0] == LOGIN) {
		// TODO: process logging in and storing
		// open('https://infisical.com/login');
		
		login();
	}
	
	// auth();
	command(args);
}

main();

