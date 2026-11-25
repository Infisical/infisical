import RE2 from "re2";

export const SID_PATTERN = new RE2("^S-1-[0-9]{1,10}(-[0-9]{1,10}){1,14}$");

export const SID_HEADER_BYTES = 8;
export const SID_SUB_AUTHORITY_BYTES = 4;
const SID_IDENTIFIER_AUTHORITY_BYTES = 6;
const SID_MAX_SUB_AUTHORITY = 0xffffffff;

export const isSidSubAuthorityInRange = (sid: string) =>
  sid
    .split("-")
    .slice(3)
    .every((subAuthority) => Number(subAuthority) <= SID_MAX_SUB_AUTHORITY);

export const hasSidLeadingZeros = (sid: string) =>
  sid
    .split("-")
    .slice(1)
    .some((part) => part.length > 1 && part.startsWith("0"));

export const isValidSid = (sid: string) =>
  SID_PATTERN.test(sid) && !hasSidLeadingZeros(sid) && isSidSubAuthorityInRange(sid);

export const sidStringToBuffer = (sid: string): Buffer => {
  const [, revision, identifierAuthority, ...subAuthorities] = sid.split("-");
  const buffer = Buffer.alloc(SID_HEADER_BYTES + subAuthorities.length * SID_SUB_AUTHORITY_BYTES);
  buffer.writeUInt8(Number(revision), 0);
  buffer.writeUInt8(subAuthorities.length, 1);
  buffer.writeUIntBE(Number(identifierAuthority), 2, SID_IDENTIFIER_AUTHORITY_BYTES);
  subAuthorities.forEach((subAuthority, index) =>
    buffer.writeUInt32LE(Number(subAuthority), SID_HEADER_BYTES + index * SID_SUB_AUTHORITY_BYTES)
  );
  return buffer;
};

export const sidBufferToString = (buffer: Buffer): string => {
  const subAuthorityCount = buffer.readUInt8(1);
  const subAuthorities = Array.from({ length: subAuthorityCount }, (_, index) =>
    buffer.readUInt32LE(SID_HEADER_BYTES + index * SID_SUB_AUTHORITY_BYTES)
  );
  return ["S", buffer.readUInt8(0), buffer.readUIntBE(2, SID_IDENTIFIER_AUTHORITY_BYTES), ...subAuthorities].join("-");
};
