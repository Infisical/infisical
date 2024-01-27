/************************************************************************************************
*
*  Attention: The credentials below are only for development purposes, it should never be used for production  
*
************************************************************************************************/

import { Key, Membership, MembershipOrg, Organization, User, Workspace } from "../models";
import { SecretService } from "../services";
import { Types } from "mongoose";
import { getNodeEnv } from "../config";

export const testUserEmail = "test@localhost.local"
export const testUserPassword = "testInfisical1"
export const testUserId = "63cefa6ec8d3175601cfa980"
export const testWorkspaceId = "63cefb15c8d3175601cfa989"
export const testOrgId = "63cefb15c8d3175601cfa985"
export const testMembershipId = "63cefb159185d9aa3ef0cf35"
export const testMembershipOrgId = "63cefb159185d9aa3ef0cf31"
export const testWorkspaceKeyId = "63cf48f0225e6955acec5eff"
export const plainTextWorkspaceKey = "543fef8224813a46230b0a50a46c5fb2"

export const createTestUserForDevelopment = async () => {
  if ((await getNodeEnv()) === "development" || (await getNodeEnv()) === "test") {
    const testUser = {
      _id: testUserId,
      email: testUserEmail,
      refreshVersion: 0,
      encryptedPrivateKey: "ITMdDXtLoxib4+53U/qzvIV/T/UalRwimogFCXv/UsulzEoiKM+aK2aqOb0=",
      firstName: "Jake",
      iv: "9fp0dZHI+UuHeKkWMDvD6w==",
      lastName: "Moni",
      publicKey: "cf44BhkybbBfsE0fZHe2jvqtCj6KLXvSq4hVjV0svzk=",
      salt: "d8099dc70958090346910fb9639262b83cf526fc9b4555a171b36a9e1bcd0240",
      tag: "bQ/UTghqcQHRoSMpLQD33g==",
      verifier: "12271fcd50937ca4512e1e3166adaf9d9fc7a5cd0e4c4cb3eda89f35572ede4d9eef23f64aef9220367abff9437b0b6fa55792c442f177201d87051cf77dadade254ff667170440327355fb7d6ac4745d4db302f4843632c2ed5919ebdcff343287a4cd552255d9e3ce81177edefe089617b7616683901475d393405f554634b9bf9230c041ac85624f37a60401be20b78044932580ae0868323be3749fbf856df1518153ba375fec628275f0c445f237446ea4aa7f12c1aa1d6b5fd74b7f2e88d062845a19819ec63f2d2ed9e9f37c055149649461d997d2ae1482f53b04f9de7493efbb9686fb19b2d559b9aa2b502c22dec83f9fc43290dfea89a1dc6f03580b3642b3824513853e81a441be9a0b2fde2231bac60f3287872617a36884697805eeea673cf1a351697834484ada0f282e4745015c9c2928d61e6d092f1b9c3a27eda8413175d23bb2edae62f82ccaf52bf5a6a90344a766c7e4ebf65dae9ae90b2ad4ae65dbf16e3a6948e429771cc50307ae86d454f71a746939ed061f080dd3ae369c1a0739819aca17af46a085bac1f2a5d936d198e7951a8ac3bb38b893665fe7312835abd3f61811f81efa2a8761af5070085f9b6adcca80bf9b0d81899c3d41487fba90728bb24eceb98bd69770360a232624133700ceb4d153f2ad702e0a5b7dfaf97d20bc8aa71dc8c20024a58c06a8fecdad18cb5a2f89c51eaf7",
    }

    const testWorkspaceKey = {
      _id: new Types.ObjectId(testWorkspaceKeyId),
      workspace: testWorkspaceId,
      encryptedKey: "96ZIRSU21CjVzIQ4Yp994FGWQvDdyK3gq+z+NCaJLK0ByTlvUePmf+AYGFJjkAdz",
      nonce: "1jhCGqg9Wx3n0OtVxbDgiYYGq4S3EdgO",
      sender: "63cefa6ec8d3175601cfa980",
      receiver: "63cefa6ec8d3175601cfa980",
    }

    const testWorkspace = {
      _id: new Types.ObjectId(testWorkspaceId),
      name: "Example Project",
      organization: testOrgId,
      environments: [
        {
          _id: "63cefb15c8d3175601cfa98a",
          name: "Development",
          slug: "dev",
        },
        {
          _id: "63cefb15c8d3175601cfa98b",
          name: "Test",
          slug: "test",
        },
        {
          _id: "63cefb15c8d3175601cfa98c",
          name: "Staging",
          slug: "staging",
        },
        {
          _id: "63cefb15c8d3175601cfa98d",
          name: "Production",
          slug: "prod",
        },
      ],
    }

    const testOrg = {
      _id: testOrgId,
      name: "Jake's organization",
    }

    const testMembershipOrg = {
      _id: testMembershipOrgId,
      organization: testOrgId,
      role: "admin",
      status: "accepted",
      user: testUserId,
    }

    const testMembership = {
      _id: testMembershipId,
      role: "admin",
      user: testUserId,
      workspace: testWorkspaceId,
    }

    try {
      // create user if not exist 
      const userInDB = await User.findById(testUserId)
      if (!userInDB) {
        await User.create(testUser)
      }

      // create org if not exist 
      const orgInDB = await Organization.findById(testOrgId)
      if (!orgInDB) {
        await Organization.create(testOrg)
      }

      // create membership org if not exist
      const membershipOrgInDB = await MembershipOrg.findById(testMembershipOrgId)
      if (!membershipOrgInDB) {
        await MembershipOrg.create(testMembershipOrg)
      }

      // create membership
      const membershipInDB = await Membership.findById(testMembershipId)
      if (!membershipInDB) {
        await Membership.create(testMembership)
      }

      // create workspace if not exist 
      const workspaceInDB = await Workspace.findById(testWorkspaceId)
      if (!workspaceInDB) {
        const workspace = await Workspace.create(testWorkspace)

        // initialize blind index salt for workspace
        await SecretService.createSecretBlindIndexData({
          workspaceId: workspace._id,
        });
      }

      // create workspace key if not exist
      const workspaceKeyInDB = await Key.findById(testWorkspaceKeyId)
      if (!workspaceKeyInDB) {
        await Key.create(testWorkspaceKey)
      }

      /* eslint-disable no-console */
      console.info(`DEVELOPMENT MODE DETECTED: You may login with test user with email: ${testUserEmail} and password: ${testUserPassword}`)
      /* eslint-enable no-console */

    } catch (e) {
      /* eslint-disable no-console */
      console.error(`Unable to create test user while booting up [err=${e}]`)
      /* eslint-enable no-console */
    }
  }
}