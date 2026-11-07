import { createHash, generateKeyPairSync, sign } from "node:crypto";

import {
  assessWebRecording,
  canonicalizeRecording,
  immutableRecordingChunkMatches,
  recordingChainHead,
  TWebRecordingChunk,
  verifyRecordingSignature
} from "./pam-web-recording-fns";

describe("Web App recording evidence", () => {
  const digest = createHash("sha256").update("ciphertext").digest();
  const chunk: TWebRecordingChunk = {
    chunkIndex: 0,
    ciphertextSha256: digest,
    ciphertextBytes: 10,
    iv: Buffer.alloc(12),
    startElapsedMs: 0,
    endElapsedMs: 100,
    storageBackend: "postgres",
    verifiedAt: new Date(),
    verifiedSha256: digest
  };
  const final = {
    chunksEmitted: 1,
    lastEndElapsedMs: 100,
    terminalEventIncluded: true,
    gaps: [],
    droppedCaptureFrames: 0,
    droppedMoves: 0
  };
  const input = {
    chunks: [chunk],
    final,
    stopConfirmedAt: new Date(),
    expectedChunkCount: 1,
    expectedChainHead: recordingChainHead([digest])
  };
  test("uses JCS numeric serialization and UTF-16 property ordering", () => {
    expect(canonicalizeRecording({ z: -0, a: 1e30, array: ["\n", 4.5, true] })).toBe(
      '{"a":1e+30,"array":["\\n",4.5,true],"z":0}'
    );
    expect(canonicalizeRecording({ "\uE000": 1, "😀": 2 })).toBe('{"😀":2,"":1}');
    expect(() => canonicalizeRecording({ bad: "\ud800" })).toThrow();
    expect(() => canonicalizeRecording({ bad: Infinity })).toThrow();
  });
  test("chains digest bytes starting from 32 zero bytes", () => {
    const head = createHash("sha256").update(Buffer.alloc(32)).update(digest).digest();
    expect(recordingChainHead([digest])).toEqual(head);
    expect(recordingChainHead([digest, digest])).toEqual(createHash("sha256").update(head).update(digest).digest());
  });
  test("requires verified terminal coverage and confirmed shutdown", () => {
    expect(assessWebRecording(input).status).toBe("complete");
    expect(assessWebRecording({ ...input, final: { ...final, recordingFailed: true } }).status).toBe("incomplete");
    expect(assessWebRecording({ ...input, stopConfirmedAt: null }).status).toBe("incomplete");
    expect(assessWebRecording({ ...input, final: { ...final, terminalEventIncluded: false } }).status).toBe(
      "incomplete"
    );
    expect(assessWebRecording({ ...input, chunks: [{ ...chunk, startElapsedMs: 1 }] }).status).toBe("incomplete");
    expect(assessWebRecording({ ...input, final: { ...final, chunksEmitted: 2 } }).status).toBe("incomplete");
    expect(assessWebRecording({ ...input, expectedChainHead: Buffer.alloc(32) }).status).toBe("mismatch");
  });
  test("detects object-version substitution and metadata conflicts", () => {
    expect(immutableRecordingChunkMatches(chunk, { ...chunk })).toBe(true);
    expect(
      immutableRecordingChunkMatches(
        { ...chunk, externalObjectVersionId: "original" },
        { ...chunk, externalObjectVersionId: "replacement" }
      )
    ).toBe(false);
    expect(immutableRecordingChunkMatches(chunk, { ...chunk, endElapsedMs: 101 })).toBe(false);
  });
  test("verifies canonical signed evidence and rejects altered evidence", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const canonical = { v: 1, sessionId: "test", allocationGen: 1 };
    const signature = sign("RSA-SHA256", Buffer.from(canonicalizeRecording(canonical)), privateKey);
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyRecordingSignature(canonical, signature, pem)).toBe(true);
    expect(verifyRecordingSignature({ ...canonical, allocationGen: 2 }, signature, pem)).toBe(false);
  });
});
