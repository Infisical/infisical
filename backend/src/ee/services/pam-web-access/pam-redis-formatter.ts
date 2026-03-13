export const tokenizeRedisInput = (input: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let inQuote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inQuote) {
      if (ch === inQuote) {
        tokens.push(current);
        current = "";
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
};

export const formatRedisReply = (reply: unknown, indent: number = 0): string => {
  const prefix = " ".repeat(indent);

  if (reply === null || reply === undefined) {
    return `${prefix}(nil)`;
  }

  if (typeof reply === "number" || typeof reply === "bigint") {
    return `${prefix}(integer) ${reply}`;
  }

  if (typeof reply === "string") {
    return `${prefix}"${reply}"`;
  }

  if (Buffer.isBuffer(reply)) {
    return `${prefix}"${reply.toString()}"`;
  }

  if (Array.isArray(reply)) {
    if (reply.length === 0) {
      return `${prefix}(empty array)`;
    }
    return reply.map((item, i) => `${prefix}${i + 1}) ${formatRedisReply(item, indent + 3).trimStart()}`).join("\n");
  }

  return `${prefix}"${String(reply)}"`;
};
