import { BadRequestError } from "@app/lib/errors";

import { KerberosEncryptionType, TKeytabEntry } from "./kerberos-types";

const KEYTAB_FORMAT_VERSION = 0x0502;
const KEYTAB_NAME_TYPE_AND_TIMESTAMP_BYTES = 8;
const KEYTAB_EXTENDED_KEY_VERSION_BYTES = 4;

const AES_KEY_BYTES: Record<KerberosEncryptionType, number> = {
  [KerberosEncryptionType.Aes128CtsHmacSha196]: 16,
  [KerberosEncryptionType.Aes256CtsHmacSha196]: 32
};

const isAesEncryptionType = (encryptionType: number): encryptionType is KerberosEncryptionType =>
  encryptionType in AES_KEY_BYTES;

const parseKeytabEntry = (entry: Buffer) => {
  let offset = 0;
  const readBytes = (length: number) => {
    if (offset + length > entry.length) throw new RangeError("Keytab entry is truncated");
    const bytes = entry.subarray(offset, offset + length);
    offset += length;
    return bytes;
  };
  const readCountedString = () => {
    const value = readBytes(readBytes(2).readUInt16BE()).toString("utf8");
    if (!value || [...value].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f))
      throw new RangeError("Keytab name is empty or has control characters");
    return value;
  };

  const componentCount = readBytes(2).readUInt16BE();
  if (!componentCount) throw new RangeError("Keytab principal has no name");
  const realm = readCountedString();
  const components: string[] = [];
  for (let index = 0; index < componentCount; index += 1) {
    components.push(readCountedString());
  }
  readBytes(KEYTAB_NAME_TYPE_AND_TIMESTAMP_BYTES);
  let keyVersion = readBytes(1).readUInt8();
  const encryptionType = readBytes(2).readUInt16BE();
  const key = Buffer.from(readBytes(readBytes(2).readUInt16BE()));
  if (entry.length - offset >= KEYTAB_EXTENDED_KEY_VERSION_BYTES) {
    keyVersion = readBytes(KEYTAB_EXTENDED_KEY_VERSION_BYTES).readUInt32BE() || keyVersion;
  }

  return {
    realm,
    principal: components.join("/"),
    keyVersion,
    encryptionType,
    key
  };
};

export const parseKeytab = (keytab: Buffer): TKeytabEntry[] => {
  const entries: TKeytabEntry[] = [];
  try {
    if (keytab.readUInt16BE(0) !== KEYTAB_FORMAT_VERSION) throw new RangeError("Unsupported keytab version");
    let offset = 2;
    while (offset < keytab.length) {
      const entrySize = keytab.readInt32BE(offset);
      if (entrySize === 0) break;
      offset += 4;
      if (entrySize < 0) {
        offset -= entrySize;
      } else {
        if (offset + entrySize > keytab.length) throw new RangeError("Keytab entry is truncated");
        const entry = parseKeytabEntry(keytab.subarray(offset, offset + entrySize));
        if (isAesEncryptionType(entry.encryptionType)) {
          if (entry.key.length !== AES_KEY_BYTES[entry.encryptionType])
            throw new RangeError("Keytab key has the wrong length");
          entries.push({ ...entry, encryptionType: entry.encryptionType });
        }
        offset += entrySize;
      }
    }
  } catch {
    throw new BadRequestError({
      message: "The uploaded file is not a valid keytab. Upload the keytab file that ktpass created."
    });
  }

  if (!entries.length) {
    throw new BadRequestError({
      message: "The keytab has no AES keys. Create it again with ktpass using /crypto AES256-SHA1."
    });
  }
  return entries;
};
