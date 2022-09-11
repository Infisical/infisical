#! /usr/bin/env node
// command args[0]
const CONNECT = "connect";
const LOGIN = "login";
const PUSH = "push";
const PULL = "pull";
const NODE = "node";

// parsing
const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg

// links

const INFISICAL_URL = "https://api.infisical.com"
// const INFISICAL_URL = "http://localhost:4000"

// hosts
const LOGIN_HOST = 'api.infisical.com';
const KEYS_HOST = 'keys.infisical.com';

module.exports = {
	CONNECT,
	LOGIN,
	PUSH,
	PULL,
	NODE,
	LINE,
	INFISICAL_URL,
	LOGIN_HOST,
	KEYS_HOST
}
