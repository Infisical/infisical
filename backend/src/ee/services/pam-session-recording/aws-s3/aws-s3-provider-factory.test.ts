import { Readable } from "node:stream";

import { describe, expect, test } from "vitest";

import { capResponseBody, readUpTo } from "./aws-s3-provider-factory";

describe("readUpTo", () => {
  test("stops reading a body that runs past the limit", async () => {
    const chunks = [Buffer.alloc(4, 1), Buffer.alloc(4, 2), Buffer.alloc(4, 3)];
    let served = 0;
    const body = Readable.from(
      (function* serve() {
        for (const chunk of chunks) {
          served += 1;
          yield chunk;
        }
      })()
    );

    const read = await readUpTo(body, 6);

    expect(read).toEqual(Buffer.concat([Buffer.alloc(4, 1), Buffer.alloc(2, 2)]));
    expect(served).toBe(2);
  });

  test("returns a body shorter than the limit whole", async () => {
    const read = await readUpTo(Readable.from([Buffer.from("abc")]), 10);

    expect(read.toString()).toBe("abc");
  });
});

describe("capResponseBody", () => {
  test("cuts off a reply body, an error's included, before the SDK reads it", async () => {
    let served = 0;
    const body = Readable.from(
      (function* serve() {
        for (let i = 0; i < 100; i += 1) {
          served += 1;
          yield Buffer.alloc(4, i);
        }
      })()
    );
    const next = async () => ({ response: { statusCode: 500, body }, output: {} });

    const result = await capResponseBody(6)(next as never, {} as never)({ input: {}, request: {} } as never);
    const read = await readUpTo((result.response as { body: Readable }).body, 1024);

    expect(read).toEqual(Buffer.concat([Buffer.alloc(4, 0), Buffer.alloc(2, 1)]));
    expect(served).toBeLessThan(100);
  });
});
