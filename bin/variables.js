#! /usr/bin/env node
// command args[0]
const CONNECT = "connect";
const LOGIN = "login";
const PUSH = "push";
const PULL = "pull";

// parsing
const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg

// links
// TODO: replace with real URL
const INFISICAL_URL = "http://localhost:4000";

// hosts
const LOGIN_HOST = 'api.infisical.com';
const KEYS_HOST = 'keys.infisical.com';

module.exports = {
	CONNECT,
	LOGIN,
	PUSH,
	PULL,
	LINE,
	INFISICAL_URL,
	LOGIN_HOST,
	KEYS_HOST
}
