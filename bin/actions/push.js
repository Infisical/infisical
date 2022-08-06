#! /usr/bin/env node
const path = require('path');
const fs = require('fs');
const {
	read,
	parse
} = require('../utilities/file');

/**
 * Identify, encrypt, and send .env file
*/
const push = () => {

	// TODO 1: see if .env file exists
	// TODO 2: encrypt it with private key
	// TODO 3: use axios to send it
		
	const file = read(".env");
	console.log(file);
	

	// encrypt file etc.
	// const text = parse(buffer);
	
	process.exit(0);
}

module.exports = push;
