import {
  CLIENT_ID_HEROKU,
  CLIENT_ID_NETLIFY,
  CLIENT_ID_GITHUB,
  CLIENT_SLUG_VERCEL,
} from "../config";

// integrations
const INTEGRATION_HEROKU = "heroku";
const INTEGRATION_VERCEL = "vercel";
const INTEGRATION_NETLIFY = "netlify";
const INTEGRATION_GITHUB = "github";
const INTEGRATION_RENDER = "render";
const INTEGRATION_FLYIO = "flyio";
const INTEGRATION_CIRCLECI = "circleci";
const INTEGRATION_SET = new Set([
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_RENDER,
  INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
]);

// integration types
const INTEGRATION_OAUTH2 = "oauth2";

// integration oauth endpoints
const INTEGRATION_HEROKU_TOKEN_URL = "https://id.heroku.com/oauth/token";
const INTEGRATION_VERCEL_TOKEN_URL =
  "https://api.vercel.com/v2/oauth/access_token";
const INTEGRATION_NETLIFY_TOKEN_URL = "https://api.netlify.com/oauth/token";
const INTEGRATION_GITHUB_TOKEN_URL =
  "https://github.com/login/oauth/access_token";

// integration apps endpoints
const INTEGRATION_HEROKU_API_URL = "https://api.heroku.com";
const INTEGRATION_VERCEL_API_URL = "https://api.vercel.com";
const INTEGRATION_NETLIFY_API_URL = "https://api.netlify.com";
const INTEGRATION_RENDER_API_URL = "https://api.render.com";
const INTEGRATION_FLYIO_API_URL = "https://api.fly.io/graphql";
const INTEGRATION_CIRCLECI_API_URL = "https://circleci.com/api";

const INTEGRATION_OPTIONS = [
  {
    name: "Heroku",
    slug: "heroku",
    image: "Heroku.png",
    isAvailable: true,
    type: "oauth",
    clientId: CLIENT_ID_HEROKU,
    docsLink: "",
  },
  {
    name: "Vercel",
    slug: "vercel",
    image: "Vercel.png",
    isAvailable: true,
    type: "oauth",
    clientId: "",
    clientSlug: CLIENT_SLUG_VERCEL,
    docsLink: "",
  },
  {
    name: "Netlify",
    slug: "netlify",
    image: "Netlify.png",
    isAvailable: true,
    type: "oauth",
    clientId: CLIENT_ID_NETLIFY,
    docsLink: "",
  },
  {
    name: "GitHub",
    slug: "github",
    image: "GitHub.png",
    isAvailable: true,
    type: "oauth",
    clientId: CLIENT_ID_GITHUB,
    docsLink: "",
  },
  {
    name: "Render",
    slug: "render",
    image: "Render.png",
    isAvailable: true,
    type: "pat",
    clientId: "",
    docsLink: "",
  },
  {
    name: "Fly.io",
    slug: "flyio",
    image: "Flyio.svg",
    isAvailable: true,
    type: "pat",
    clientId: "",
    docsLink: "",
  },
  {
    name: "Google Cloud Platform",
    slug: "gcp",
    image: "Google Cloud Platform.png",
    isAvailable: false,
    type: "",
    clientId: "",
    docsLink: "",
  },
  {
    name: "Amazon Web Services",
    slug: "aws",
    image: "Amazon Web Services.png",
    isAvailable: false,
    type: "",
    clientId: "",
    docsLink: "",
  },
  {
    name: "Microsoft Azure",
    slug: "azure",
    image: "Microsoft Azure.png",
    isAvailable: false,
    type: "",
    clientId: "",
    docsLink: "",
  },
  {
    name: "Travis CI",
    slug: "travisci",
    image: "Travis CI.png",
    isAvailable: false,
    type: "",
    clientId: "",
    docsLink: "",
  },
  {
    name: "Circle CI",
    slug: "circleci",
    image: "Circle CI.png",
    isAvailable: false,
    type: "",
    clientId: "",
    docsLink: "",
  },
];

export {
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_RENDER,
  INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
  INTEGRATION_SET,
  INTEGRATION_OAUTH2,
  INTEGRATION_HEROKU_TOKEN_URL,
  INTEGRATION_VERCEL_TOKEN_URL,
  INTEGRATION_NETLIFY_TOKEN_URL,
  INTEGRATION_GITHUB_TOKEN_URL,
  INTEGRATION_HEROKU_API_URL,
  INTEGRATION_VERCEL_API_URL,
  INTEGRATION_NETLIFY_API_URL,
  INTEGRATION_RENDER_API_URL,
  INTEGRATION_FLYIO_API_URL,
  INTEGRATION_CIRCLECI_API_URL,
  INTEGRATION_OPTIONS,
};
