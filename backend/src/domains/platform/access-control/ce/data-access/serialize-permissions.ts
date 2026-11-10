// permissions columns are jsonb. Knex sends a JS array as a Postgres array literal, which jsonb then stores as an
// object, so packed rules are written as JSON text.
export const serializePermissions = (permissions: unknown) =>
  typeof permissions === "string" || permissions === null || permissions === undefined
    ? permissions
    : JSON.stringify(permissions);
