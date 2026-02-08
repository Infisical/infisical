import { useCallback, useEffect, useRef, useState } from "react";

type WebSocketStatus = "connecting" | "connected" | "disconnected" | "error";

type UseWebSocketOptions = {
  relayHost: string | undefined;
  relayClientCertificate: string | undefined;
  sharedSecret: string | undefined;
  sessionId: string | undefined;
  resourceType: string | undefined;
};

const NONCE_SIZE = 12;
const LENGTH_PREFIX_SIZE = 4;
const RELAY_PORT = 8444;
const HANDSHAKE_TIMEOUT_MS = 30_000;

const asBuffer = (arr: Uint8Array): ArrayBuffer => arr.buffer as ArrayBuffer;

const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const writeLengthPrefixed = (data: Uint8Array): Uint8Array => {
  const frame = new Uint8Array(LENGTH_PREFIX_SIZE + data.length);
  new DataView(frame.buffer).setUint32(0, data.length, false);
  frame.set(data, LENGTH_PREFIX_SIZE);
  return frame;
};

const readLengthPrefixed = (data: Uint8Array): Uint8Array => {
  const len = new DataView(data.buffer, data.byteOffset, LENGTH_PREFIX_SIZE).getUint32(0, false);
  return data.slice(LENGTH_PREFIX_SIZE, LENGTH_PREFIX_SIZE + len);
};

const hmacSign = async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, asBuffer(data)));
};

const hmacVerify = async (
  key: Uint8Array,
  data: Uint8Array,
  signature: Uint8Array
): Promise<boolean> => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", cryptoKey, asBuffer(signature), asBuffer(data));
};

const deriveAesKey = async (ecdhSharedSecret: ArrayBuffer): Promise<CryptoKey> =>
  crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("infisical-pam-web-encryption")
    },
    await crypto.subtle.importKey("raw", ecdhSharedSecret, "HKDF", false, ["deriveKey"]),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

const encryptFrame = async (aesKey: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> => {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, asBuffer(plaintext))
  );
  const payload = new Uint8Array(NONCE_SIZE + ciphertext.length);
  payload.set(nonce, 0);
  payload.set(ciphertext, NONCE_SIZE);
  return writeLengthPrefixed(payload);
};

const isLocalHost = (host: string) =>
  host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("192.168.");

const buildRelayUrls = (host: string) => {
  const isLocal = isLocalHost(host);
  const httpBase = `${isLocal ? "http" : "https"}://${host}:${RELAY_PORT}`;
  const wsBase = `${isLocal ? "ws" : "wss"}://${host}:${RELAY_PORT}`;
  return {
    authUrl: `${httpBase}/ws/authenticate`,
    wsUrl: `${wsBase}/ws`
  };
};

const waitForOpen = (ws: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

const waitForMessage = (ws: WebSocket, timeoutMs: number): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Handshake timeout")), timeoutMs);
    ws.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data as ArrayBuffer);
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket error during handshake"));
    };
  });

export const useWebSocket = ({
  relayHost,
  relayClientCertificate,
  sharedSecret,
  sessionId,
  resourceType
}: UseWebSocketOptions) => {
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const [messages, setMessages] = useState<Uint8Array[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const aesKeyRef = useRef<CryptoKey | null>(null);
  const recvBufferRef = useRef<Uint8Array>(new Uint8Array(0));
  const abortRef = useRef<AbortController | null>(null);

  const optionsRef = useRef({ relayHost, relayClientCertificate, sharedSecret, sessionId, resourceType });
  optionsRef.current = { relayHost, relayClientCertificate, sharedSecret, sessionId, resourceType };

  const parseEncryptedFrames = useCallback(async (incoming: Uint8Array) => {
    const prev = recvBufferRef.current;
    const combined = new Uint8Array(prev.length + incoming.length);
    combined.set(prev, 0);
    combined.set(incoming, prev.length);
    recvBufferRef.current = combined;

    const decrypted: Uint8Array[] = [];
    let offset = 0;

    while (offset + LENGTH_PREFIX_SIZE <= recvBufferRef.current.length) {
      const frameLen = new DataView(
        recvBufferRef.current.buffer,
        recvBufferRef.current.byteOffset + offset,
        LENGTH_PREFIX_SIZE
      ).getUint32(0, false);

      if (offset + LENGTH_PREFIX_SIZE + frameLen > recvBufferRef.current.length) break;

      const frameData = recvBufferRef.current.slice(
        offset + LENGTH_PREFIX_SIZE,
        offset + LENGTH_PREFIX_SIZE + frameLen
      );
      const plaintext = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: frameData.slice(0, NONCE_SIZE) },
          aesKeyRef.current!,
          asBuffer(frameData.slice(NONCE_SIZE))
        )
      );
      decrypted.push(plaintext);
      offset += LENGTH_PREFIX_SIZE + frameLen;
    }

    recvBufferRef.current = recvBufferRef.current.slice(offset);

    if (decrypted.length > 0) {
      setMessages((prev) => [...prev, ...decrypted]);
    }
  }, []);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    aesKeyRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    disconnect();

    const opts = optionsRef.current;
    if (!opts.relayHost || !opts.relayClientCertificate || !opts.sharedSecret || !opts.sessionId || !opts.resourceType)
      return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setStatus("connecting");
    setMessages([]);
    recvBufferRef.current = new Uint8Array(0);

    try {
      const sharedSecretBytes = base64ToBytes(opts.sharedSecret);
      const { authUrl, wsUrl } = buildRelayUrls(opts.relayHost);

      // Authenticate with relay
      const authRes = await fetch(authUrl, { method: "POST", body: opts.relayClientCertificate, signal });
      if (!authRes.ok) {
        setStatus("error");
        return;
      }

      const { connectionId } = (await authRes.json()) as { connectionId: string };
      if (signal.aborted) return;

      const ws = new WebSocket(`${wsUrl}?connectionId=${connectionId}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      await waitForOpen(ws);

      if (signal.aborted) {
        ws.close();
        return;
      }

      // ECDH handshake — send client public key with 0x00 magic byte
      const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
        "deriveBits"
      ]);
      const rawPubKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));

      const handshakePayload = writeLengthPrefixed(
        new TextEncoder().encode(
          JSON.stringify({
            sessionId: opts.sessionId,
            resourceType: opts.resourceType,
            publicKey: bytesToBase64(rawPubKey),
            signature: bytesToBase64(await hmacSign(sharedSecretBytes, rawPubKey))
          })
        )
      );
      const withMagic = new Uint8Array(1 + handshakePayload.length);
      withMagic[0] = 0x00;
      withMagic.set(handshakePayload, 1);
      ws.send(withMagic);

      // Receive and verify gateway handshake response
      const gatewayResponse = await waitForMessage(ws, HANDSHAKE_TIMEOUT_MS);
      if (signal.aborted) {
        ws.close();
        return;
      }

      const gatewayHandshake = JSON.parse(
        new TextDecoder().decode(readLengthPrefixed(new Uint8Array(gatewayResponse)))
      ) as { publicKey: string; signature: string };

      const gatewayPubKeyBytes = base64ToBytes(gatewayHandshake.publicKey);
      if (
        !(await hmacVerify(
          sharedSecretBytes,
          gatewayPubKeyBytes,
          base64ToBytes(gatewayHandshake.signature)
        ))
      ) {
        ws.close();
        if (!signal.aborted) setStatus("error");
        return;
      }

      // Derive AES key from ECDH shared secret
      const gatewayPubCryptoKey = await crypto.subtle.importKey(
        "raw",
        asBuffer(gatewayPubKeyBytes),
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
      );
      const ecdhBits = await crypto.subtle.deriveBits(
        { name: "ECDH", public: gatewayPubCryptoKey },
        keyPair.privateKey,
        256
      );
      aesKeyRef.current = await deriveAesKey(ecdhBits);
      if (!signal.aborted) setStatus("connected");

      // Encrypted communication
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          parseEncryptedFrames(new Uint8Array(event.data));
        }
      };
      ws.onerror = () => {
        if (!signal.aborted) setStatus("error");
      };
      ws.onclose = () => {
        if (!signal.aborted) setStatus("disconnected");
        wsRef.current = null;
        aesKeyRef.current = null;
      };
    } catch {
      if (!signal.aborted) setStatus("error");
    }
  }, [disconnect, parseEncryptedFrames]);

  useEffect(() => {
    if (!relayHost || !relayClientCertificate || !sharedSecret || !sessionId || !resourceType)
      return;

    connect();
    return disconnect;
  }, [relayHost, relayClientCertificate, sharedSecret, sessionId, resourceType, connect, disconnect]);

  const send = useCallback(async (data: Uint8Array) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && aesKeyRef.current) {
      wsRef.current.send(await encryptFrame(aesKeyRef.current, data));
    }
  }, []);

  return { status, messages, send, reconnect: connect };
};
