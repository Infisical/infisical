import { crypto } from "@app/lib/crypto/cryptography";

import { parsePacLogonInfo } from "./kerberos-pac";
import { buildTestPac, TEST_DOMAIN_SID } from "./kerberos.test-helpers";

const RESOURCE_DOMAIN_SID = "S-1-5-21-1444444444-1555555555-1666666666";

describe("parsePacLogonInfo", () => {
  const serviceKey = crypto.randomBytes(32);

  test("lists the account, primary group, enabled groups, extra SIDs and resource groups", () => {
    const pac = buildTestPac({
      serviceKey,
      logonInfo: {
        groupRids: [515, 1200],
        extraSids: ["S-1-18-1"],
        resourceGroups: { domainSid: RESOURCE_DOMAIN_SID, rids: [3001], disabledRids: [] }
      }
    });

    expect(parsePacLogonInfo(pac)?.groupSids).toEqual([
      `${TEST_DOMAIN_SID}-1105`,
      `${TEST_DOMAIN_SID}-515`,
      `${TEST_DOMAIN_SID}-515`,
      `${TEST_DOMAIN_SID}-1200`,
      "S-1-18-1",
      `${RESOURCE_DOMAIN_SID}-3001`
    ]);
  });

  test("leaves out groups, extra SIDs and resource groups that are not enabled", () => {
    const pac = buildTestPac({
      serviceKey,
      logonInfo: {
        groupRids: [515],
        disabledGroupRids: [1200],
        extraSids: ["S-1-18-1"],
        disabledExtraSids: ["S-1-5-21-1777777777-1888888888-1999999999-1300"],
        resourceGroups: { domainSid: RESOURCE_DOMAIN_SID, rids: [3001], disabledRids: [3002] }
      }
    });

    expect(parsePacLogonInfo(pac)?.groupSids).toEqual([
      `${TEST_DOMAIN_SID}-1105`,
      `${TEST_DOMAIN_SID}-515`,
      `${TEST_DOMAIN_SID}-515`,
      "S-1-18-1",
      `${RESOURCE_DOMAIN_SID}-3001`
    ]);
  });
});
