import net from "node:net";

import * as dnsPacket from "dns-packet";

// Resolve a hostname to an IP via DNS-over-TCP through a local proxy port
export const resolveDnsTcp = (hostname: string, proxyPort: number): Promise<string | null> => {
  return new Promise((resolve) => {
    const query = dnsPacket.streamEncode({
      type: "query",
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: "A", name: hostname }]
    });

    const socket = net.connect({ host: "127.0.0.1", port: proxyPort }, () => {
      socket.write(query);
    });

    const MAX_DNS_TCP_SIZE = 2 + 65535;
    let responseData = Buffer.alloc(0);

    socket.on("data", (chunk: Buffer) => {
      responseData = Buffer.concat([responseData, chunk]);

      if (responseData.length > MAX_DNS_TCP_SIZE) {
        socket.destroy();
        resolve(null);
        return;
      }

      if (responseData.length >= 2) {
        const msgLen = responseData.readUInt16BE(0);
        if (responseData.length >= 2 + msgLen) {
          try {
            const response = dnsPacket.streamDecode(responseData);
            const aRecord = response.answers?.find((a) => a.type === "A");
            socket.destroy();
            resolve(aRecord && "data" in aRecord ? (aRecord.data as string) : null);
          } catch {
            socket.destroy();
            resolve(null);
          }
        }
      }
    });

    socket.on("error", () => {
      resolve(null);
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve(null);
    });
  });
};
