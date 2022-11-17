// membership roles
const OWNER = 'owner';
const ADMIN = 'admin';
const MEMBER = 'member';

// membership statuses
const INVITED = 'invited';

// -- organization
const ACCEPTED = 'accepted';

// -- workspace
const COMPLETED = 'completed';
const GRANTED = 'granted';

// subscriptions
const PLAN_STARTER = 'starter';
const PLAN_PRO = 'pro';

// secrets
const SECRET_SHARED = 'shared';
const SECRET_PERSONAL = 'personal';

// environments
const ENV_DEV = 'dev';
const ENV_TESTING = 'test';
const ENV_STAGING = 'staging';
const ENV_PROD = 'prod';
const ENV_SET = new Set([ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD]);

// integrations
const INTEGRATION_HEROKU = 'heroku';
const INTEGRATION_NETLIFY = 'netlify';
const INTEGRATION_SET = new Set([INTEGRATION_HEROKU, INTEGRATION_NETLIFY]);

// integration types
const INTEGRATION_OAUTH2 = 'oauth2';

export {
	OWNER,
	ADMIN,
	MEMBER,
	INVITED,
	ACCEPTED,
	COMPLETED,
	GRANTED,
	PLAN_STARTER,
	PLAN_PRO,
	SECRET_SHARED,
	SECRET_PERSONAL,
	ENV_DEV,
	ENV_TESTING,
	ENV_STAGING,
	ENV_PROD,
	ENV_SET,
	INTEGRATION_HEROKU,
	INTEGRATION_NETLIFY,
	INTEGRATION_SET,
	INTEGRATION_OAUTH2
};
