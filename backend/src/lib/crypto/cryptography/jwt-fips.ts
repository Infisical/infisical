import crypto from "crypto";
import RE2 from "re2";

import { Algorithm, CompleteJWTPayload, JWTPayload, JWTSecretOrKey, JWTSignOptions, JWTVerifyOptions } from "./types";

export const jwtFipsValidated = () => {
  const $base64urlEncode = (str: string) => Buffer.from(str).toString("base64url");
  const $isRSAAlgorithm = (algorithm: string) => algorithm.startsWith("RS");

  const $parseTimeToSeconds = (timeStr: string | number) => {
    if (typeof timeStr === "number") {
      return timeStr;
    }

    const match = new RE2(/^(\d+)([smhd])$/).exec(timeStr);
    if (!match) {
      throw new Error(`Invalid time format: ${timeStr}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 60 * 60;
      case "d":
        return value * 60 * 60 * 24;
      default:
        throw new Error(`Unknown time unit: ${unit}`);
    }
  };

  const $getHashAlgorithm = (algorithm: string) => {
    switch (algorithm) {
      case "HS256":
      case "RS256":
        return "sha256";
      case "HS384":
      case "RS384":
        return "sha384";
      case "HS512":
      case "RS512":
        return "sha512";
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  };

  /**
   * Sign a JWT token
   */
  const sign = (payload: JWTPayload, secretOrPrivateKey: JWTSecretOrKey, options: JWTSignOptions = {}) => {
    const algorithm = options.algorithm || "HS256";

    const now = Math.floor(Date.now() / 1000);
    // Create header
    const header = {
      alg: algorithm,
      typ: "JWT",
      ...(options.keyid && { kid: options.keyid })
    };

    // Create payload with timestamps
    const finalPayload = {
      ...payload,
      iat: now,
      ...(options.expiresIn !== undefined && { exp: now + $parseTimeToSeconds(options.expiresIn) })
    };

    // Encode header and payload
    const encodedHeader = $base64urlEncode(JSON.stringify(header));
    const encodedPayload = $base64urlEncode(JSON.stringify(finalPayload));

    // Create signature
    const data = `${encodedHeader}.${encodedPayload}`;
    const hashAlgorithm = $getHashAlgorithm(algorithm);
    let signature: string;

    if ($isRSAAlgorithm(algorithm)) {
      let privateKey: crypto.KeyLike | { key: string | Buffer };

      if (typeof secretOrPrivateKey === "string") {
        try {
          // Try to create a proper private key object
          privateKey = crypto.createPrivateKey(secretOrPrivateKey);
        } catch (error) {
          throw new Error("Invalid JWT private key");
        }
      } else {
        privateKey = secretOrPrivateKey;
      }

      const signatureBuffer = crypto.sign(hashAlgorithm, Buffer.from(data), privateKey);
      signature = signatureBuffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    } else {
      // HMAC signing
      if (typeof secretOrPrivateKey !== "string") {
        throw new Error("HMAC algorithms require a string secret");
      }
      signature = crypto
        .createHmac(hashAlgorithm, secretOrPrivateKey)
        .update(data)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    }

    return `${data}.${signature}`;
  };

  const verify = (token: string, secretOrKey: JWTSecretOrKey, options: JWTVerifyOptions = {}) => {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Decode header
    const headerJson = Buffer.from(encodedHeader, "base64").toString();
    const header = JSON.parse(headerJson) as { alg: string; typ: string; kid?: string };

    if (!header.alg || header.typ !== "JWT") {
      throw new Error("Invalid JWT header");
    }

    // Extract the actual key from different input types
    let keyString: string;
    if (Buffer.isBuffer(secretOrKey)) {
      keyString = secretOrKey.toString();
    } else if (typeof secretOrKey === "object" && "key" in secretOrKey) {
      keyString = Buffer.isBuffer(secretOrKey.key) ? secretOrKey.key.toString() : secretOrKey.key;
    } else {
      keyString = secretOrKey as string;
    }

    // Verify signature
    const data = `${encodedHeader}.${encodedPayload}`;
    const hashAlgorithm = $getHashAlgorithm(header.alg);
    let isValidSignature: boolean;

    if ($isRSAAlgorithm(header.alg)) {
      // For RSA, handle both private and public keys
      let verificationKey: crypto.KeyLike;

      // Clean up the key format
      const cleanKey = keyString.replace(/\\n/g, "\n");

      try {
        // If it's a private key, extract the public key for verification
        if (cleanKey.includes("PRIVATE KEY")) {
          const privateKeyObj = crypto.createPrivateKey(cleanKey);
          verificationKey = crypto.createPublicKey(privateKeyObj);
        } else {
          // It's already a public key
          verificationKey = crypto.createPublicKey(cleanKey);
        }
      } catch (error) {
        throw new Error("Invalid JWT signature");
      }

      // Convert base64url signature back to buffer
      const signatureBuffer = Buffer.from(
        signature.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (signature.length % 4)) % 4),
        "base64"
      );
      isValidSignature = crypto.verify(hashAlgorithm, Buffer.from(data), verificationKey, signatureBuffer);
    } else {
      // HMAC verification
      const expectedSignature = crypto
        .createHmac(hashAlgorithm, keyString)
        .update(data)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
      isValidSignature = signature === expectedSignature;
    }

    if (!isValidSignature) {
      throw new Error("Invalid JWT signature");
    }

    // Decode payload
    const payloadJson = Buffer.from(encodedPayload, "base64").toString();
    const payload = JSON.parse(payloadJson) as JWTPayload & {
      aud?: string | string[];
      iss?: string;
      sub?: string;
      nbf?: number;
      jti?: string;
    };

    const now = Math.floor(Date.now() / 1000);
    const clockTolerance = options.clockTolerance || 0;

    // Check expiration
    if (!options.ignoreExpiration && payload.exp && now - clockTolerance > payload.exp) {
      throw new Error("JWT token has expired");
    }

    // Check not before
    if (!options.ignoreNotBefore && payload.nbf && now + clockTolerance < payload.nbf) {
      throw new Error("JWT not active");
    }

    // Check audience
    if (options.audience) {
      const audiences = Array.isArray(options.audience) ? options.audience : [options.audience];
      const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      const hasValidAudience = audiences.some((aud) => tokenAudiences.includes(aud));
      if (!hasValidAudience) {
        throw new Error("JWT audience invalid");
      }
    }

    // Check issuer
    if (options.issuer) {
      const issuers = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
      if (!payload.iss || !issuers.includes(payload.iss)) {
        throw new Error("JWT issuer invalid");
      }
    }

    // Check subject
    if (options.subject && payload.sub !== options.subject) {
      throw new Error("JWT subject invalid");
    }

    // Check JWT ID
    if (options.jwtid && payload.jti !== options.jwtid) {
      throw new Error("JWT ID invalid");
    }

    // Check max age
    if (options.maxAge && payload.iat) {
      const maxAgeSeconds = typeof options.maxAge === "string" ? $parseTimeToSeconds(options.maxAge) : options.maxAge;
      if (now - payload.iat > maxAgeSeconds) {
        throw new Error("JWT max age exceeded");
      }
    }

    // Check algorithms
    if (options.algorithms && !options.algorithms.includes(header.alg as Algorithm)) {
      throw new Error(`Algorithm not allowed: ${header.alg}`);
    }

    return payload;
  };

  const decode = (token: string, options: { complete?: boolean } = {}): JWTPayload | CompleteJWTPayload => {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const [encodedHeader, encodedPayload] = parts;

    // Decode header
    const headerJson = Buffer.from(encodedHeader, "base64").toString();
    const header = JSON.parse(headerJson) as Record<string, unknown>;

    // Decode payload
    const payloadJson = Buffer.from(encodedPayload, "base64").toString();
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;

    // Return complete token info or just payload
    if (options.complete) {
      return {
        header,
        payload,
        signature: parts[2]
      };
    }

    return payload as JWTPayload;
  };

  return {
    sign,
    verify,
    decode
  };
};
