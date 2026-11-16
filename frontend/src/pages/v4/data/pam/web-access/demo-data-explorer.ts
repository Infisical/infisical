type TValue = string | number | boolean | null;
type TRow = Record<string, TValue>;
type TColumn = { name: string; type: string; nullable: boolean; identityGeneration: string | null };
type TTable = {
  tableType: "table" | "view";
  columns: TColumn[];
  primaryKeys: string[];
  foreignKeys: {
    constraintName: string;
    columns: string[];
    targetSchema: string;
    targetTable: string;
    targetColumns: string[];
  }[];
  rows: TRow[];
};

const column = (name: string, type: string, nullable = false, identity = false): TColumn => ({
  name,
  type,
  nullable,
  identityGeneration: identity ? "BY DEFAULT" : null
});

const pick = <T>(items: readonly T[], index: number) => items[index % items.length] as T;

const at = (dayOffset: number, minutes = 0) =>
  new Date(Date.UTC(2026, 9, 1) + dayOffset * 86_400_000 + minutes * 60_000).toISOString();

const FIRST = [
  "Ada",
  "Grace",
  "Linus",
  "Margaret",
  "Alan",
  "Barbara",
  "Dennis",
  "Frances",
  "Ken",
  "Radia",
  "Edsger",
  "Hedy"
];
const LAST = [
  "Lovelace",
  "Hopper",
  "Torvalds",
  "Hamilton",
  "Turing",
  "Liskov",
  "Ritchie",
  "Allen",
  "Thompson",
  "Perlman",
  "Dijkstra",
  "Lamarr"
];
const PLANS = ["free", "pro", "enterprise"];
const COUNTRIES = ["CA", "US", "DE", "GB", "JP", "BR", "IN", "FR"];
const STATUSES = ["delivered", "shipped", "processing", "pending", "cancelled"];
const PRODUCTS = [
  "Desk lamp",
  "Notebook",
  "Mechanical keyboard",
  "Monitor arm",
  "Cable kit",
  "Headphones",
  "Webcam",
  "Standing mat"
];

const customers: TRow[] = Array.from({ length: 48 }, (_, index) => {
  const first = pick(FIRST, index);
  const last = pick(LAST, index * 5 + 3);
  return {
    id: index + 1,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${index}@example.com`,
    full_name: `${first} ${last}`,
    plan: pick(PLANS, index * 7),
    country: pick(COUNTRIES, index * 3),
    created_at: at(-index * 4, index * 37),
    is_active: index % 9 !== 4
  };
});

const products: TRow[] = PRODUCTS.flatMap((name, index) =>
  ["standard", "plus", "max"].map((tier, tierIndex) => ({
    sku: `SKU-${String(index * 3 + tierIndex + 1).padStart(4, "0")}`,
    name: `${name} ${tier}`,
    price_cents: 1500 + index * 2300 + tierIndex * 1100,
    stock: (index * 17 + tierIndex * 11) % 140,
    metadata: JSON.stringify({ color: pick(["black", "white", "oak"], index + tierIndex), tier })
  }))
);

const orders: TRow[] = Array.from({ length: 180 }, (_, index) => ({
  id: 10_001 + index,
  customer_id: ((index * 7) % customers.length) + 1,
  status: pick(STATUSES, index * 3 + (index % 4)),
  total_cents: 1800 + ((index * 4127) % 94_000),
  currency: pick(["USD", "CAD", "EUR"], index),
  placed_at: at(-(index % 60), index * 13),
  notes: index % 6 === 0 ? "Leave at the front desk" : null
}));

const orderItems: TRow[] = orders.flatMap((order, index) =>
  Array.from({ length: (index % 3) + 1 }, (_, item) => ({
    order_id: order.id,
    sku: pick(products, index * 5 + item).sku,
    quantity: ((index + item) % 4) + 1
  }))
);

const eventLog: TRow[] = Array.from({ length: 60 }, (_, index) => ({
  occurred_at: at(-(index % 10), index * 7),
  level: pick(["info", "info", "warn", "error"], index),
  message: pick(
    [
      "Nightly export finished",
      "Payment provider slow to respond",
      "Retrying webhook delivery",
      "Cache warmed"
    ],
    index
  )
}));

const dailyRevenue: TRow[] = Array.from({ length: 30 }, (_, index) => ({
  day: at(-index).slice(0, 10),
  orders: 40 + ((index * 13) % 35),
  revenue_cents: 180_000 + ((index * 52_331) % 420_000)
}));

const hex = (seed: number, length: number) => {
  let value = "";
  let state = (seed * 7919) % 2_147_483_648;
  while (value.length < length) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    value += state.toString(16);
  }
  return value.slice(0, length);
};

const traceId = (index: number) =>
  `${hex(index + 1, 8)}-${hex(index + 2, 4)}-4${hex(index + 3, 3)}-a${hex(index + 4, 3)}-${hex(index + 5, 12)}`;

const TRACE_COLUMNS: TColumn[] = [
  column("trace_id", "uuid"),
  column("started_at", "timestamptz"),
  column("duration_ms", "int4"),
  column("service", "text"),
  column("environment", "text"),
  column("region", "text"),
  column("http_method", "text"),
  column("http_status", "int4"),
  column("request_path", "text"),
  column("query_string", "text", true),
  column("user_agent", "text"),
  column("client_ip", "inet"),
  column("customer_id", "int4", true),
  column("request_bytes", "int8"),
  column("response_bytes", "int8"),
  column("cache_status", "text"),
  column("upstream_host", "text"),
  column("retry_count", "int2"),
  column("feature_flags", "jsonb"),
  column("error_message", "text", true),
  column("tags", "text[]"),
  column("sampled", "bool")
];

const traces: TRow[] = Array.from({ length: 2400 }, (_, index) => {
  const status = pick([200, 200, 200, 201, 204, 304, 400, 404, 409, 500, 503], index * 7);
  return {
    trace_id: traceId(index),
    started_at: at(-(index % 14), index * 3),
    duration_ms: 4 + ((index * 389) % 2900),
    service: pick(
      [
        "checkout-api",
        "catalog-service",
        "identity-gateway",
        "fulfillment-worker-eu-central-reconciliation"
      ],
      index
    ),
    environment: pick(["production", "staging"], index * 3),
    region: pick(["us-east-1", "eu-central-1", "ap-northeast-1", "ca-central-1"], index),
    http_method: pick(["GET", "POST", "PUT", "DELETE"], index * 5),
    http_status: status,
    request_path: pick(
      [
        "/v2/orders",
        "/v2/catalog/products/search",
        "/v2/customers/accounts/preferences/notifications/channels/email/digest-frequency",
        "/healthz"
      ],
      index
    ),
    query_string:
      index % 3 === 0
        ? null
        : `page=${(index % 40) + 1}&per_page=100&sort=-placed_at&include=customer,line_items,shipping_address,billing_address,discounts`,
    user_agent: pick(
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
        "acme-mobile/7.12.0 (iPhone; iOS 18.1; Scale/3.00)",
        "python-requests/2.32.3"
      ],
      index
    ),
    client_ip: `10.${index % 255}.${(index * 7) % 255}.${(index * 13) % 255}`,
    customer_id: index % 4 === 0 ? null : (index % customers.length) + 1,
    request_bytes: 120 + ((index * 977) % 48_000),
    response_bytes: 340 + ((index * 7919) % 1_800_000),
    cache_status: pick(["MISS", "HIT", "BYPASS", "EXPIRED"], index),
    upstream_host: pick(
      [
        "orders-primary.internal.acme.dev",
        "catalog-read-replica-03.eu-central-1.internal.acme.dev"
      ],
      index
    ),
    retry_count: index % 7 === 0 ? 2 : 0,
    feature_flags: JSON.stringify({
      newCheckout: index % 2 === 0,
      cartRecovery: index % 5 === 0,
      region: pick(["na", "eu", "apac"], index)
    }),
    error_message:
      status >= 500
        ? "upstream connect error or disconnect/reset before headers. retried and the latest reset reason: connection timeout after 3000ms while waiting for orders-primary"
        : null,
    tags: `{${pick(["checkout", "search", "auth"], index)},${pick(["web", "mobile"], index * 3)}}`,
    sampled: index % 10 === 0
  };
});

const tables: Record<string, Record<string, TTable>> = {
  public: {
    customers: {
      tableType: "table",
      columns: [
        column("id", "int4", false, true),
        column("email", "text"),
        column("full_name", "text"),
        column("plan", "text"),
        column("country", "text"),
        column("created_at", "timestamptz"),
        column("is_active", "bool")
      ],
      primaryKeys: ["id"],
      foreignKeys: [],
      rows: customers
    },
    orders: {
      tableType: "table",
      columns: [
        column("id", "int4", false, true),
        column("customer_id", "int4"),
        column("status", "text"),
        column("total_cents", "int8"),
        column("currency", "text"),
        column("placed_at", "timestamptz"),
        column("notes", "text", true)
      ],
      primaryKeys: ["id"],
      foreignKeys: [
        {
          constraintName: "orders_customer_id_fkey",
          columns: ["customer_id"],
          targetSchema: "public",
          targetTable: "customers",
          targetColumns: ["id"]
        }
      ],
      rows: orders
    },
    order_items: {
      tableType: "table",
      columns: [column("order_id", "int4"), column("sku", "text"), column("quantity", "int4")],
      primaryKeys: ["order_id", "sku"],
      foreignKeys: [],
      rows: orderItems
    },
    products: {
      tableType: "table",
      columns: [
        column("sku", "text"),
        column("name", "text"),
        column("price_cents", "int4"),
        column("stock", "int4"),
        column("metadata", "jsonb", true)
      ],
      primaryKeys: ["sku"],
      foreignKeys: [],
      rows: products
    },
    open_orders: {
      tableType: "view",
      columns: [
        column("id", "int4"),
        column("customer_id", "int4"),
        column("status", "text"),
        column("total_cents", "int8")
      ],
      primaryKeys: [],
      foreignKeys: [],
      rows: orders
        .filter(({ status }) => status === "pending" || status === "processing")
        .map(({ id, customer_id: customerId, status, total_cents: total }) => ({
          id,
          customer_id: customerId,
          status,
          total_cents: total
        }))
    },
    event_log: {
      tableType: "table",
      columns: [
        column("occurred_at", "timestamptz"),
        column("level", "text"),
        column("message", "text")
      ],
      primaryKeys: [],
      foreignKeys: [],
      rows: eventLog
    }
  },
  analytics: {
    daily_revenue: {
      tableType: "table",
      columns: [column("day", "date"), column("orders", "int4"), column("revenue_cents", "int8")],
      primaryKeys: ["day"],
      foreignKeys: [],
      rows: dailyRevenue
    },
    request_traces: {
      tableType: "table",
      columns: TRACE_COLUMNS,
      primaryKeys: ["trace_id"],
      foreignKeys: [],
      rows: traces
    }
  }
};

type TToken = { kind: "ident" | "literal" | "word" | "symbol"; text: string; value?: TValue };

const tokenize = (sql: string): TToken[] => {
  const tokens: TToken[] = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index] as string;
    if (/\s/.test(char)) {
      index += 1;
    } else if (char === '"' || char === "\u0060") {
      let end = index + 1;
      let text = "";
      while (end < sql.length) {
        if (sql[end] === char && sql[end + 1] === char) {
          text += char;
          end += 2;
        } else if (sql[end] === char) break;
        else {
          text += sql[end];
          end += 1;
        }
      }
      tokens.push({ kind: "ident", text });
      index = end + 1;
    } else if (char === "'") {
      let end = index + 1;
      let text = "";
      while (end < sql.length) {
        if (sql[end] === "\\" && sql[end + 1] !== undefined) {
          text += sql[end + 1];
          end += 2;
        } else if (sql[end] === "'" && sql[end + 1] === "'") {
          text += "'";
          end += 2;
        } else if (sql[end] === "'") break;
        else {
          text += sql[end];
          end += 1;
        }
      }
      tokens.push({ kind: "literal", text, value: text });
      index = end + 1;
    } else if (sql.startsWith("$$", index)) {
      const end = sql.indexOf("$$", index + 2);
      const text = sql.slice(index + 2, end < 0 ? sql.length : end);
      tokens.push({ kind: "literal", text, value: text });
      index = end < 0 ? sql.length : end + 2;
    } else if (/[\d-]/.test(char) && /^-?\d/.test(sql.slice(index, index + 2))) {
      const match = /^-?\d+(\.\d+)?/.exec(sql.slice(index)) as RegExpExecArray;
      tokens.push({ kind: "literal", text: match[0], value: Number(match[0]) });
      index += match[0].length;
    } else if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][\w$]*/.exec(sql.slice(index)) as RegExpExecArray;
      const upper = match[0].toUpperCase();
      if (upper === "NULL") tokens.push({ kind: "literal", text: upper, value: null });
      else if (upper === "TRUE" || upper === "FALSE")
        tokens.push({ kind: "literal", text: upper, value: upper === "TRUE" });
      else tokens.push({ kind: "word", text: match[0] });
      index += match[0].length;
    } else {
      const two = sql.slice(index, index + 2);
      const symbol = ["<>", ">=", "<=", "!="].includes(two) ? two : char;
      tokens.push({ kind: "symbol", text: symbol });
      index += symbol.length;
    }
  }
  return tokens;
};

class SqlError extends Error {
  detail?: string;

  hint?: string;

  constructor(message: string, extra?: { detail?: string; hint?: string }) {
    super(message);
    this.detail = extra?.detail;
    this.hint = extra?.hint;
  }
}

const isWord = (token: TToken | undefined, word: string) =>
  token?.kind === "word" && token.text.toUpperCase() === word;

const resolveTable = (tokens: TToken[], start: number) => {
  const first = tokens[start];
  if (!first || (first.kind !== "ident" && first.kind !== "word"))
    throw new SqlError(`syntax error at or near "${first?.text ?? "end of input"}"`);
  let schema = "public";
  let name = first.text;
  let next = start + 1;
  if (tokens[next]?.text === ".") {
    schema = first.text;
    name = tokens[next + 1]?.text ?? "";
    next += 2;
  }
  const table = tables[schema]?.[name] ?? tables[schema.toLowerCase()]?.[name.toLowerCase()];
  if (!table)
    throw new SqlError(
      `relation "${schema === "public" ? name : `${schema}.${name}`}" does not exist`
    );
  return { table, next };
};

const compare = (left: TValue, right: TValue) => {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true });
};

const likeToRegex = (pattern: string, caseInsensitive: boolean) =>
  new RegExp(
    `^${pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".")}$`,
    caseInsensitive ? "i" : ""
  );

const parseConditions = (tokens: TToken[], start: number, stop: (token: TToken) => boolean) => {
  const conditions: ((row: TRow) => boolean)[] = [];
  let index = start;
  while (index < tokens.length && !stop(tokens[index] as TToken)) {
    const target = tokens[index];
    if (!target || (target.kind !== "ident" && target.kind !== "word"))
      throw new SqlError(`syntax error at or near "${target?.text ?? "end of input"}"`);
    const name = target.text;
    const operator = tokens[index + 1];
    index += 2;
    if (isWord(operator, "IS")) {
      const negate = isWord(tokens[index], "NOT");
      if (negate) index += 1;
      index += 1;
      conditions.push((row) => (row[name] === null) !== negate);
    } else if (isWord(operator, "IN")) {
      const values: TValue[] = [];
      index += 1;
      while (index < tokens.length && tokens[index]?.text !== ")") {
        const token = tokens[index] as TToken;
        if (token.kind === "literal") values.push(token.value ?? null);
        index += 1;
      }
      index += 1;
      conditions.push((row) => values.some((value) => compare(row[name] ?? null, value) === 0));
    } else {
      const operand = tokens[index]?.value ?? null;
      index += 1;
      const symbol = operator?.text.toUpperCase();
      conditions.push((row) => {
        const value = row[name] ?? null;
        if (symbol === "LIKE" || symbol === "ILIKE")
          return likeToRegex(String(operand), symbol === "ILIKE").test(String(value ?? ""));
        if (value === null || operand === null) return false;
        const order = compare(value, operand);
        if (symbol === "=") return order === 0;
        if (symbol === "<>" || symbol === "!=") return order !== 0;
        if (symbol === ">") return order > 0;
        if (symbol === "<") return order < 0;
        if (symbol === ">=") return order >= 0;
        if (symbol === "<=") return order <= 0;
        throw new SqlError(`operator does not exist: ${operator?.text ?? ""}`);
      });
    }
    if (isWord(tokens[index], "AND")) index += 1;
  }
  return { match: (row: TRow) => conditions.every((condition) => condition(row)), next: index };
};

const RESULT_ROW_LIMIT = 1000;

type TResult = {
  rows: TRow[];
  fields: { name: string }[];
  rowCount: number | null;
  isTruncated: boolean;
  command: string;
};

const runSelect = (tokens: TToken[]): TResult => {
  const fromIndex = tokens.findIndex((token) => isWord(token, "FROM"));
  if (fromIndex < 0) {
    const fields = tokens.slice(1).filter((token) => token.kind === "literal");
    if (fields.length === 0)
      throw new SqlError(`syntax error at or near "${tokens[1]?.text ?? "SELECT"}"`);
    const row = Object.fromEntries(
      fields.map((token, index) => [
        index === 0 ? "?column?" : `?column?${index}`,
        token.value ?? null
      ])
    );
    return {
      rows: [row],
      fields: Object.keys(row).map((name) => ({ name })),
      rowCount: 1,
      isTruncated: false,
      command: "SELECT"
    };
  }
  const projection = tokens.slice(1, fromIndex);
  const { table, next } = resolveTable(tokens, fromIndex + 1);
  let index = next;
  let { rows } = table;
  if (isWord(tokens[index], "WHERE")) {
    const where = parseConditions(tokens, index + 1, (token) =>
      ["ORDER", "LIMIT", "OFFSET"].some((word) => isWord(token, word))
    );
    rows = rows.filter(where.match);
    index = where.next;
  }
  if (projection.some((token) => isWord(token, "COUNT")))
    return {
      rows: [{ count: rows.length }],
      fields: [{ name: "count" }],
      rowCount: 1,
      isTruncated: false,
      command: "SELECT"
    };
  if (isWord(tokens[index], "ORDER")) {
    index += 2;
    const sorts: { name: string; direction: number }[] = [];
    while (
      index < tokens.length &&
      !isWord(tokens[index], "LIMIT") &&
      !isWord(tokens[index], "OFFSET")
    ) {
      const name = tokens[index]?.text ?? "";
      index += 1;
      let direction = 1;
      if (isWord(tokens[index], "DESC") || isWord(tokens[index], "ASC")) {
        direction = isWord(tokens[index], "DESC") ? -1 : 1;
        index += 1;
      }
      if (tokens[index]?.text === ",") index += 1;
      sorts.push({ name, direction });
    }
    rows = [...rows].sort((left, right) => {
      const found = sorts.find(
        ({ name }) => compare(left[name] ?? null, right[name] ?? null) !== 0
      );
      return found
        ? compare(left[found.name] ?? null, right[found.name] ?? null) * found.direction
        : 0;
    });
  }
  let limit: number | undefined;
  let offset = 0;
  while (index < tokens.length) {
    if (isWord(tokens[index], "LIMIT")) limit = Number(tokens[index + 1]?.value ?? 0);
    else if (isWord(tokens[index], "OFFSET")) offset = Number(tokens[index + 1]?.value ?? 0);
    index += 2;
  }
  const window = rows.slice(offset, limit === undefined ? undefined : offset + limit);
  const names =
    projection.length === 1 && projection[0]?.text === "*"
      ? table.columns.map(({ name }) => name)
      : projection.filter((token) => token.kind !== "symbol").map((token) => token.text);
  const missing = names.find((name) => !table.columns.some((entry) => entry.name === name));
  if (missing)
    throw new SqlError(`column "${missing}" does not exist`, {
      hint: "Check the column name, or run SELECT * to see every column."
    });
  const isTruncated = window.length > RESULT_ROW_LIMIT;
  const shown = window.slice(0, RESULT_ROW_LIMIT);
  return {
    rows: shown.map((row) => Object.fromEntries(names.map((name) => [name, row[name] ?? null]))),
    fields: names.map((name) => ({ name })),
    rowCount: window.length,
    isTruncated,
    command: "SELECT"
  };
};

const valuesList = (tokens: TToken[], start: number) => {
  const values: TToken[] = [];
  let index = start + 1;
  while (index < tokens.length && tokens[index]?.text !== ")") {
    const token = tokens[index] as TToken;
    if (token.text !== ",") values.push(token);
    index += 1;
  }
  return { values, next: index + 1 };
};

const runMutation = (tokens: TToken[]): TResult => {
  const verb = tokens[0]?.text.toUpperCase();
  const done = (count: number) => ({
    rows: [],
    fields: [],
    rowCount: count,
    isTruncated: false,
    command: verb ?? ""
  });
  if (verb === "INSERT") {
    const { table, next } = resolveTable(tokens, 2);
    let index = next;
    const row: TRow = Object.fromEntries(table.columns.map(({ name }) => [name, null]));
    if (tokens[index]?.text === "(") {
      const columns = valuesList(tokens, index);
      const values = valuesList(tokens, columns.next + 1);
      columns.values.forEach((token, position) => {
        row[token.text] = values.values[position]?.value ?? null;
      });
      index = values.next;
    }
    const identity = table.columns.find((entry) => entry.identityGeneration);
    if (identity && row[identity.name] === null)
      row[identity.name] =
        Math.max(0, ...table.rows.map((entry) => Number(entry[identity.name]) || 0)) + 1;
    const missing = table.columns.find((entry) => !entry.nullable && row[entry.name] === null);
    if (missing)
      throw new SqlError(`null value in column "${missing.name}" violates not-null constraint`, {
        detail: "Failing row contains a NULL where the column requires a value."
      });
    table.rows.unshift(row);
    return done(1);
  }
  if (verb === "UPDATE") {
    const { table, next } = resolveTable(tokens, 1);
    let index = next + 1;
    const changes: TRow = {};
    while (index < tokens.length && !isWord(tokens[index], "WHERE")) {
      const name = tokens[index]?.text ?? "";
      changes[name] = tokens[index + 2]?.value ?? null;
      index += 3;
      if (tokens[index]?.text === ",") index += 1;
    }
    const where = parseConditions(tokens, index + 1, (token) => isWord(token, "RETURNING"));
    let count = 0;
    table.rows.forEach((row, position) => {
      if (!where.match(row)) return;
      count += 1;
      table.rows[position] = { ...row, ...changes };
    });
    return done(count);
  }
  if (verb === "DELETE") {
    const { table, next } = resolveTable(tokens, 2);
    const where = parseConditions(tokens, next + 1, () => false);
    const before = table.rows.length;
    table.rows = table.rows.filter((row) => !where.match(row));
    return done(before - table.rows.length);
  }
  throw new SqlError(`syntax error at or near "${tokens[0]?.text ?? ""}"`);
};

const splitStatements = (sql: string) => {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  [...sql].forEach((char) => {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"' || char === "\u0060") quote = char;
    else if (char === ";") {
      statements.push(current);
      current = "";
      return;
    }
    current += char;
  });
  statements.push(current);
  return statements.map((statement) => statement.trim()).filter(Boolean);
};

export const runDemoQuery = (sql: string, transactionOpen: boolean) => {
  let open = transactionOpen;
  let result: TResult = { rows: [], fields: [], rowCount: null, isTruncated: false, command: "" };
  splitStatements(sql).forEach((statement) => {
    const tokens = tokenize(statement.replace(/--[^\n]*/g, ""));
    const verb = tokens[0]?.text.toUpperCase() ?? "";
    if (verb === "BEGIN") {
      open = true;
      result = { ...result, rowCount: null, command: "BEGIN" };
    } else if (verb === "COMMIT" || verb === "ROLLBACK") {
      open = false;
      result = { ...result, rowCount: null, command: verb };
    } else if (verb === "SELECT" || verb === "WITH") result = runSelect(tokens);
    else result = runMutation(tokens);
  });
  return { ...result, transactionOpen: open };
};

export const demoSchemas = () => Object.keys(tables).map((name) => ({ name }));

export const demoTables = (schema: string) =>
  Object.entries(tables[schema] ?? {}).map(([name, table]) => ({
    name,
    tableType: table.tableType
  }));

export const demoTableDetail = (schema: string, name: string) => {
  const table = tables[schema]?.[name];
  if (!table) throw new SqlError(`relation "${schema}.${name}" does not exist`);
  const { columns, primaryKeys, foreignKeys } = table;
  return { columns, primaryKeys, foreignKeys };
};

export { SqlError as DemoSqlError };
