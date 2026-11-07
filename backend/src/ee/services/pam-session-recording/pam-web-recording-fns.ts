import { createHash, verify } from "node:crypto";

export type TCanonicalJson = null | boolean | number | string | TCanonicalJson[] | { [key: string]: TCanonicalJson };
const assertUnicode = (value: string) => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Canonical JSON contains an invalid Unicode string");
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("Canonical JSON contains an invalid Unicode string");
  }
};

export const canonicalizeRecording = (value: TCanonicalJson): string => {
  if (typeof value === "string") {
    assertUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Canonical JSON requires finite numbers");
  if (value === null || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeRecording).join(",")}]`;
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error("Canonical JSON requires plain JSON objects");
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      assertUnicode(key);
      return `${JSON.stringify(key)}:${canonicalizeRecording(value[key])}`;
    })
    .join(",")}}`;
};

export const recordingChainHead = (digests: Buffer[]) =>
  digests.reduce((head, digest) => {
    if (digest.length !== 32) throw new Error("Recording chunk digests must be SHA-256");
    return createHash("sha256").update(head).update(digest).digest();
  }, Buffer.alloc(32));

export const verifyRecordingSignature = (canonical: TCanonicalJson, signature: Buffer, publicKeyPem: string) =>
  verify("RSA-SHA256", Buffer.from(canonicalizeRecording(canonical)), publicKeyPem, signature);

export type TWebRecordingChunk = {
  chunkIndex: number;
  ciphertextSha256: Buffer;
  ciphertextBytes: number;
  iv: Buffer;
  startElapsedMs: number;
  endElapsedMs: number;
  storageBackend: string;
  externalChunkObjectKey?: string | null;
  externalObjectVersionId?: string | null;
  verifiedAt?: Date | null;
  verifiedSha256?: Buffer | null;
};
export type TWebRecordingFinal = {
  recordingFailed?: boolean;
  chunksEmitted: number;
  lastEndElapsedMs: number;
  terminalEventIncluded: boolean;
  gaps: { fromElapsedUs: number; toElapsedUs: number; reason: string }[];
  droppedCaptureFrames: number;
  droppedMoves: number;
};

export const immutableRecordingChunkMatches = (a: TWebRecordingChunk, b: TWebRecordingChunk) =>
  a.ciphertextSha256.equals(b.ciphertextSha256) &&
  a.iv.equals(b.iv) &&
  Number(a.ciphertextBytes) === Number(b.ciphertextBytes) &&
  Number(a.startElapsedMs) === Number(b.startElapsedMs) &&
  Number(a.endElapsedMs) === Number(b.endElapsedMs) &&
  a.storageBackend === b.storageBackend &&
  (a.externalChunkObjectKey ?? null) === (b.externalChunkObjectKey ?? null) &&
  (a.externalObjectVersionId ?? null) === (b.externalObjectVersionId ?? null);

export const assessWebRecording = ({
  chunks,
  final,
  stopConfirmedAt,
  expectedChunkCount,
  expectedChainHead
}: {
  chunks: TWebRecordingChunk[];
  final: TWebRecordingFinal;
  stopConfirmedAt: Date | null;
  expectedChunkCount: number;
  expectedChainHead: Buffer;
}): { status: "complete" | "incomplete" | "mismatch"; statusDetail: string | null; chainHead: Buffer } => {
  const head = recordingChainHead(chunks.map((chunk) => chunk.ciphertextSha256));
  const result = (status: "complete" | "incomplete" | "mismatch", statusDetail: string | null) => ({
    status,
    statusDetail,
    chainHead: head
  });
  if (chunks.some((chunk) => chunk.verifiedSha256 && !chunk.verifiedSha256.equals(chunk.ciphertextSha256)))
    return result("mismatch", "A verified chunk digest does not match its metadata.");
  if (chunks.length > 10000)
    return result("incomplete", "The recording exceeds the verification limit of 10,000 chunks.");
  if (
    !chunks.length ||
    chunks.length !== final.chunksEmitted ||
    chunks.some((chunk, index) => chunk.chunkIndex !== index)
  )
    return result("incomplete", "One or more expected recording chunks are missing.");
  if (expectedChunkCount !== final.chunksEmitted || !head.equals(expectedChainHead))
    return result("mismatch", "The final recording boundary or chain does not match.");
  if (
    chunks.some(
      (chunk, index) =>
        !chunk.verifiedAt ||
        !chunk.verifiedSha256 ||
        Number(chunk.startElapsedMs) !== (index === 0 ? 0 : Number(chunks[index - 1].endElapsedMs))
    ) ||
    Number(chunks[chunks.length - 1].endElapsedMs) !== final.lastEndElapsedMs
  )
    return result("incomplete", "Recording coverage is incomplete or has not been verified.");
  if (
    final.recordingFailed ||
    !final.terminalEventIncluded ||
    final.gaps.some((gap) => gap.reason !== "detached-viewer") ||
    !stopConfirmedAt
  )
    return result("incomplete", "Terminal coverage or browser shutdown has not been confirmed.");
  return result("complete", null);
};
