import { parseKempResponse } from "./kemp-loadmaster-connection-fns";

vi.mock("@app/lib/gateway", () => ({
  GatewayProxyProtocol: { Tcp: "tcp" }
}));

describe("parseKempResponse", () => {
  test("parses a successful LoadMaster response", () => {
    expect(
      parseKempResponse('<Response stat="200" code="ok"><Success><Data><Index>1</Index></Data></Success></Response>')
    ).toEqual({
      ok: true,
      stat: "200",
      code: "ok",
      error: undefined,
      data: { Index: 1 }
    });
  });

  test("rejects repeated DOCTYPE declarations", () => {
    const payload = [
      '<!DOCTYPE Response [<!ENTITY first "first">]>',
      '<!DOCTYPE Response [<!ENTITY second "second">]>',
      '<Response stat="200" code="ok"><Success><Data>&first;&second;</Data></Success></Response>'
    ].join("");

    expect(() => parseKempResponse(payload)).toThrow("Multiple DOCTYPE declarations found");
  });
});
