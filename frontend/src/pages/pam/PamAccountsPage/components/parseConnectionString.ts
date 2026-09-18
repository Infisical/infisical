type TConnectionStringValues = {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  sslEnabled?: boolean;
  sslRejectUnauthorized?: boolean;
};

class NotAConnectionString extends Error {}

// "require" encrypts but does not verify the cert
const SSL_MODES: Record<string, TConnectionStringValues> = {
  disable: { sslEnabled: false },
  allow: { sslEnabled: false },
  prefer: { sslEnabled: true, sslRejectUnauthorized: false },
  require: { sslEnabled: true, sslRejectUnauthorized: false },
  "verify-ca": { sslEnabled: true, sslRejectUnauthorized: true },
  "verify-full": { sslEnabled: true, sslRejectUnauthorized: true }
};

const TRUTHY_SSL = new Set(["true", "1", "on", "yes", "require", "required"]);
const FALSY_SSL = new Set(["false", "0", "off", "no", "disable", "disabled"]);

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const unwrap = (raw: string) => {
  let value = raw
    .trim()
    .replace(/^psql\s+/i, "")
    .trim();

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
    value = value.slice(1, -1).trim();
  }

  return value.replace(/^jdbc:/i, "").trim();
};

const parsePort = (value: string) => {
  if (!/^\d+$/.test(value)) throw new NotAConnectionString();
  const port = Number(value);
  if (port < 1 || port > 65535) throw new NotAConnectionString();
  return port;
};

type TParseState = { values: TConnectionStringValues; sawSslMode: boolean };

const applyParameter = (key: string, value: string, state: TParseState) => {
  const target = state.values;

  switch (key.toLowerCase()) {
    case "user":
    case "username":
      if (value) target.username = value;
      break;
    case "password":
      if (value) target.password = value;
      break;
    case "dbname":
    case "database":
      if (value) target.database = value;
      break;
    case "host":
      if (value) [target.host] = value.split(",");
      break;
    case "hostaddr":
      if (value && !target.host) [target.host] = value.split(",");
      break;
    case "port": {
      const [firstPort] = value.split(",");
      if (firstPort) target.port = parsePort(firstPort);
      break;
    }
    case "sslmode": {
      const mode = SSL_MODES[value.toLowerCase()];
      if (!mode) break;
      Object.assign(target, mode);
      // eslint-disable-next-line no-param-reassign
      state.sawSslMode = true;
      break;
    }
    case "ssl":
      if (state.sawSslMode) break;
      if (TRUTHY_SSL.has(value.toLowerCase())) target.sslEnabled = true;
      if (FALSY_SSL.has(value.toLowerCase())) target.sslEnabled = false;
      break;
    default:
      break;
  }
};

const applyQuery = (query: string, state: TParseState) => {
  query.split("&").forEach((pair) => {
    const separatorIdx = pair.indexOf("=");
    if (separatorIdx === -1) return;
    applyParameter(
      decode(pair.slice(0, separatorIdx)),
      decode(pair.slice(separatorIdx + 1)),
      state
    );
  });
};

const applyHost = (hostPart: string, values: TConnectionStringValues) => {
  const target = values;

  const [firstHost] = hostPart.split(",");
  if (!firstHost) return;

  if (firstHost.startsWith("[")) {
    const closingIdx = firstHost.indexOf("]");
    if (closingIdx === -1) throw new NotAConnectionString();

    target.host = firstHost.slice(1, closingIdx);
    const remainder = firstHost.slice(closingIdx + 1);
    if (!remainder) return;
    if (!remainder.startsWith(":")) throw new NotAConnectionString();
    if (remainder.length > 1) target.port = parsePort(remainder.slice(1));
    return;
  }

  const portIdx = firstHost.lastIndexOf(":");
  if (portIdx === -1) {
    target.host = decode(firstHost);
    return;
  }

  const host = decode(firstHost.slice(0, portIdx));
  // Unbracketed IPv6: host and port are indistinguishable
  if (host.includes(":")) throw new NotAConnectionString();
  if (host) target.host = host;
  const port = firstHost.slice(portIdx + 1);
  if (port) target.port = parsePort(port);
};

const parseUri = (value: string, schemes: string[]): TConnectionStringValues => {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/(.*)$/.exec(value);
  if (!match || !schemes.some((scheme) => scheme.toLowerCase() === match[1].toLowerCase())) {
    throw new NotAConnectionString();
  }

  const rest = match[2];
  const state: TParseState = { values: {}, sawSslMode: false };
  const { values } = state;

  const queryIdx = rest.indexOf("?");
  const beforeQuery = queryIdx === -1 ? rest : rest.slice(0, queryIdx);
  const query = queryIdx === -1 ? "" : rest.slice(queryIdx + 1);

  const pathIdx = beforeQuery.indexOf("/");
  const authority = pathIdx === -1 ? beforeQuery : beforeQuery.slice(0, pathIdx);
  const path = pathIdx === -1 ? "" : beforeQuery.slice(pathIdx + 1);

  // A password may contain an unencoded "@"
  const credentialsIdx = authority.lastIndexOf("@");
  if (credentialsIdx !== -1) {
    const credentials = authority.slice(0, credentialsIdx);
    const passwordIdx = credentials.indexOf(":");
    const username = decode(passwordIdx === -1 ? credentials : credentials.slice(0, passwordIdx));
    const password = passwordIdx === -1 ? "" : decode(credentials.slice(passwordIdx + 1));
    if (username) values.username = username;
    if (password) values.password = password;
  }

  applyHost(authority.slice(credentialsIdx + 1), values);

  const [database] = path.split("/");
  if (database) values.database = decode(database);

  applyQuery(query, state);

  return values;
};

const parseKeywordValue = (value: string): TConnectionStringValues => {
  const state: TParseState = { values: {}, sawSslMode: false };
  const tokens = value.matchAll(
    /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\S*)/g
  );

  Array.from(tokens).forEach(([, key, rawValue]) => {
    const quote = rawValue[0];
    const unquoted =
      (quote === "'" || quote === '"') && rawValue.length > 1 && rawValue.endsWith(quote)
        ? rawValue.slice(1, -1).replace(/\\(.)/g, "$1")
        : rawValue;
    applyParameter(key, unquoted, state);
  });

  return state.values;
};

export const parseConnectionString = (
  raw: string,
  schemes: string[]
): TConnectionStringValues | null => {
  const value = unwrap(raw);
  if (!value) return null;

  try {
    const values = value.includes("://") ? parseUri(value, schemes) : parseKeywordValue(value);
    return Object.keys(values).length ? values : null;
  } catch {
    return null;
  }
};
