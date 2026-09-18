import ts from "typescript";

const vocabulary = new Set([
  "describe", "it", "test", "expect", "assert", "beforeEach", "afterEach", "beforeAll", "afterAll",
  "jest", "vi", "mock", "mockImplementation", "mockReturnValue", "mockResolvedValue", "spyOn",
  "fetch", "axios", "request", "connect", "createConnection", "createPool", "listen", "localhost",
  "password", "passwd", "secret", "token", "apiKey", "api_key", "accessKeyId", "secretAccessKey",
  "host", "hostname", "port", "url", "endpoint", "authorization", "headers", "env", "process",
  "DockerComposeEnvironment", "GenericContainer", "StartedTestContainer", "start", "stop"
]);
const extensions = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"]);

function literalClass(value, secret) {
  if (secret && value.includes(secret)) return "candidate-credential";
  if (/^(localhost|127\.0\.0\.1|::1)$/.test(value)) return "loopback-host";
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/.test(value)) return "loopback-url";
  if (/^(https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\//.test(value)) return "network-url";
  if (/^(test|dummy|fake|example|placeholder|changeme|password)$/i.test(value)) return "placeholder";
  return "redacted-literal";
}

export function buildContext({ file, source, line, secret }) {
  const suffix = file.split(".").at(-1).toLowerCase();
  const segments = file.toLowerCase().split(/[^a-z0-9]+/);
  const state = {
    file: {
      language: extensions.has(suffix) ? "javascript-typescript" : "other",
      testPath: segments.some((part) => ["test", "tests", "spec", "specs", "__tests__"].includes(part)),
      fixturePath: segments.some((part) => ["fixture", "fixtures", "mock", "mocks", "testdata"].includes(part)),
      documentationPath: segments.some((part) => ["docs", "documentation", "example", "examples"].includes(part))
    },
    candidate: { placeholder: /^(test|dummy|fake|example|placeholder|changeme|password)$/i.test(secret) },
    context: "metadata-only",
    tokens: [],
    truncated: false
  };
  if (!extensions.has(suffix) || source === null) return state;
  const lines = source.split("\n");
  const start = Math.max(0, line - 13);
  const end = Math.min(lines.length, line + 12);
  const excerpt = lines.slice(start, end).join("\n");
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, excerpt);
  const identifiers = new Map();
  state.context = "redacted-token-window";
  state.truncated = start > 0 || end < lines.length;
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken && state.tokens.length < 400) {
    if (token === ts.SyntaxKind.Identifier || token === ts.SyntaxKind.PrivateIdentifier) {
      const text = scanner.getTokenText();
      if (!identifiers.has(text)) identifiers.set(text, `symbol-${identifiers.size + 1}`);
      state.tokens.push(vocabulary.has(text) ? text : identifiers.get(text));
    } else if ([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral].includes(token)) {
      state.tokens.push(`<${literalClass(scanner.getTokenValue(), secret)}>`);
    } else if (token === ts.SyntaxKind.NumericLiteral || token === ts.SyntaxKind.BigIntLiteral) {
      state.tokens.push("<number>");
    } else {
      state.tokens.push(ts.tokenToString(token) ?? `<${ts.SyntaxKind[token]}>`);
    }
    token = scanner.scan();
  }
  state.truncated ||= token !== ts.SyntaxKind.EndOfFileToken;
  return state;
}
