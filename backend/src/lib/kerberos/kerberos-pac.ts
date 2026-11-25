import { crypto } from "@app/lib/crypto/cryptography";
import { SID_HEADER_BYTES, SID_SUB_AUTHORITY_BYTES, sidBufferToString } from "@app/lib/windows-sid/windows-sid-fns";

import { kerberosChecksum } from "./kerberos-crypto";
import { KerberosKeyUsage } from "./kerberos-types";

const PAC_HEADER_BYTES = 8;
const PAC_BUFFER_INFO_BYTES = 16;
const PAC_SIGNATURE_TYPE_BYTES = 4;
const HMAC_SHA1_96_SIGNATURE_BYTES = 12;
const HMAC_MD5_SIGNATURE_BYTES = 16;

const NDR_HEADER_BYTES = 16;
const NDR_POINTER_BYTES = 4;
const NDR_ALIGNMENT_BYTES = 4;
const NDR_UNICODE_STRING_BYTES = 8;
const NDR_GROUP_MEMBERSHIP_BYTES = 8;
const LOGON_INFO_TIMES_BYTES = 6 * 8;
const LOGON_INFO_NAME_COUNT = 6;
const LOGON_INFO_LOGON_COUNTS_BYTES = 4;
const LOGON_INFO_USER_FLAGS_AND_SESSION_KEY_BYTES = 4 + 16;
const LOGON_INFO_RESERVED1_BYTES = 8;
const LOGON_INFO_ACCOUNT_CONTROL_TO_RESERVED3_BYTES = 4 + 4 + 8 + 8 + 4 + 4;
const GROUP_ATTRIBUTES_OFFSET = 4;
const SE_GROUP_ENABLED = 0x4;

enum PacBufferType {
  LogonInfo = 1,
  ServerChecksum = 6,
  PrivilegeServerChecksum = 7
}

enum PacSignatureType {
  HmacMd5 = -138,
  HmacSha196Aes128 = 15,
  HmacSha196Aes256 = 16
}

type TPacLogonInfo = {
  domainSid: string;
  accountSid: string;
  groupSids: string[];
};

const isGroupEnabled = (attributes: number) =>
  // eslint-disable-next-line no-bitwise
  (attributes & SE_GROUP_ENABLED) !== 0;

const readPacBuffers = (pac: Buffer) =>
  Array.from({ length: pac.readUInt32LE(0) }, (_, index) => {
    const infoOffset = PAC_HEADER_BYTES + index * PAC_BUFFER_INFO_BYTES;
    const size = pac.readUInt32LE(infoOffset + 4);
    const offset = Number(pac.readBigUInt64LE(infoOffset + 8));
    return {
      type: pac.readUInt32LE(infoOffset),
      offset,
      data: pac.subarray(offset, offset + size)
    };
  });

export const verifyPacServerSignature = (pac: Buffer, serviceKey: Buffer) => {
  const zeroedPac = Buffer.from(pac);
  let serverSignature: { type: number; value: Buffer } | null = null;
  for (const buffer of readPacBuffers(pac)) {
    if (buffer.type === PacBufferType.ServerChecksum || buffer.type === PacBufferType.PrivilegeServerChecksum) {
      const signatureType = buffer.data.readInt32LE(0);
      const signatureLength =
        signatureType === PacSignatureType.HmacMd5 ? HMAC_MD5_SIGNATURE_BYTES : HMAC_SHA1_96_SIGNATURE_BYTES;
      const signatureOffset = buffer.offset + PAC_SIGNATURE_TYPE_BYTES;
      zeroedPac.fill(0, signatureOffset, signatureOffset + signatureLength);
      if (buffer.type === PacBufferType.ServerChecksum) {
        serverSignature = {
          type: signatureType,
          value: buffer.data.subarray(PAC_SIGNATURE_TYPE_BYTES, PAC_SIGNATURE_TYPE_BYTES + signatureLength)
        };
      }
    }
  }

  if (
    !serverSignature ||
    (serverSignature.type !== PacSignatureType.HmacSha196Aes128 &&
      serverSignature.type !== PacSignatureType.HmacSha196Aes256)
  ) {
    return false;
  }
  const expected = kerberosChecksum(serviceKey, KerberosKeyUsage.PacChecksum, zeroedPac);
  return (
    serverSignature.value.length === expected.length &&
    crypto.nativeCrypto.timingSafeEqual(expected, serverSignature.value)
  );
};

const parseLogonInfo = (data: Buffer): TPacLogonInfo => {
  let offset = NDR_HEADER_BYTES + NDR_POINTER_BYTES;
  const align = () => {
    offset = NDR_HEADER_BYTES + Math.ceil((offset - NDR_HEADER_BYTES) / NDR_ALIGNMENT_BYTES) * NDR_ALIGNMENT_BYTES;
  };
  const readUInt32 = () => {
    const value = data.readUInt32LE(offset);
    offset += 4;
    return value;
  };
  const readStringPointer = () => {
    const pointer = data.readUInt32LE(offset + 4);
    offset += NDR_UNICODE_STRING_BYTES;
    return pointer;
  };
  const skipString = (pointer: number) => {
    if (!pointer) return;
    align();
    offset += 8;
    const characterCount = readUInt32();
    offset += characterCount * 2;
    align();
  };
  const readSid = () => {
    align();
    offset += 4;
    const sid = sidBufferToString(data.subarray(offset));
    offset += SID_HEADER_BYTES + data.readUInt8(offset + 1) * SID_SUB_AUTHORITY_BYTES;
    align();
    return sid;
  };

  offset += LOGON_INFO_TIMES_BYTES;
  const namePointers = Array.from({ length: LOGON_INFO_NAME_COUNT }, readStringPointer);
  offset += LOGON_INFO_LOGON_COUNTS_BYTES;
  const userId = readUInt32();
  const primaryGroupId = readUInt32();
  const groupCount = readUInt32();
  const groupIdsPointer = readUInt32();
  offset += LOGON_INFO_USER_FLAGS_AND_SESSION_KEY_BYTES;
  const logonServerPointer = readStringPointer();
  const logonDomainNamePointer = readStringPointer();
  const logonDomainIdPointer = readUInt32();
  offset += LOGON_INFO_RESERVED1_BYTES + LOGON_INFO_ACCOUNT_CONTROL_TO_RESERVED3_BYTES;
  const extraSidCount = readUInt32();
  const extraSidsPointer = readUInt32();
  const resourceGroupDomainSidPointer = readUInt32();
  const resourceGroupCount = readUInt32();
  const resourceGroupIdsPointer = readUInt32();

  namePointers.forEach(skipString);
  const groupRids: number[] = [];
  if (groupIdsPointer) {
    align();
    offset += 4;
    for (let index = 0; index < groupCount; index += 1) {
      if (isGroupEnabled(data.readUInt32LE(offset + GROUP_ATTRIBUTES_OFFSET))) {
        groupRids.push(data.readUInt32LE(offset));
      }
      offset += NDR_GROUP_MEMBERSHIP_BYTES;
    }
  }
  skipString(logonServerPointer);
  skipString(logonDomainNamePointer);
  if (!logonDomainIdPointer) throw new Error("PAC logon info has no domain SID");
  const domainSid = readSid();

  const extraSids: string[] = [];
  if (extraSidsPointer) {
    align();
    offset += 4;
    const extraSidEntries: { pointer: number; attributes: number }[] = [];
    for (let index = 0; index < extraSidCount; index += 1) {
      extraSidEntries.push({
        pointer: data.readUInt32LE(offset),
        attributes: data.readUInt32LE(offset + GROUP_ATTRIBUTES_OFFSET)
      });
      offset += NDR_GROUP_MEMBERSHIP_BYTES;
    }
    for (const { pointer, attributes } of extraSidEntries) {
      if (pointer) {
        const sid = readSid();
        if (isGroupEnabled(attributes)) extraSids.push(sid);
      }
    }
  }

  const resourceGroupSids: string[] = [];
  if (resourceGroupDomainSidPointer) {
    const resourceGroupDomainSid = readSid();
    if (resourceGroupIdsPointer) {
      align();
      offset += 4;
      for (let index = 0; index < resourceGroupCount; index += 1) {
        if (isGroupEnabled(data.readUInt32LE(offset + GROUP_ATTRIBUTES_OFFSET))) {
          resourceGroupSids.push(`${resourceGroupDomainSid}-${data.readUInt32LE(offset)}`);
        }
        offset += NDR_GROUP_MEMBERSHIP_BYTES;
      }
    }
  }

  const accountSid = `${domainSid}-${userId}`;
  return {
    domainSid,
    accountSid,
    groupSids: [
      accountSid,
      `${domainSid}-${primaryGroupId}`,
      ...groupRids.map((rid) => `${domainSid}-${rid}`),
      ...extraSids,
      ...resourceGroupSids
    ]
  };
};

export const parsePacLogonInfo = (pac: Buffer) => {
  const logonInfo = readPacBuffers(pac).find((buffer) => buffer.type === PacBufferType.LogonInfo);
  return logonInfo ? parseLogonInfo(logonInfo.data) : null;
};
