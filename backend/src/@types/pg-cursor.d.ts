declare module "pg-cursor" {
  import type { Connection } from "pg";

  interface CursorConfig {
    types?: {
      getTypeParser: (oid: number) => (val: string | Buffer) => unknown;
    };
  }

  class Cursor<TRow extends Record<string, unknown> = Record<string, unknown>> {
    // Internal result object populated after read() completes.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _result: {
      fields: { name: string }[];
      command: string | null;
      rowCount: number | null;
    };

    constructor(text: string, values?: unknown[] | null, config?: CursorConfig);

    submit(connection: Connection): void;
    read(rows: number): Promise<TRow[]>;
    close(): Promise<void>;
  }

  export = Cursor;
}
