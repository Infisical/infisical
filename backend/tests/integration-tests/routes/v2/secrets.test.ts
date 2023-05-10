// import request from 'supertest'
// import main from '../../../../src/index'
// import { testWorkspaceId } from '../../../../src/utils/addDevelopmentUser';
// import { deleteAllSecrets, getAllSecrets, getJWTFromTestUser, getServiceTokenFromTestUser } from '../../../helper/helper';
// // eslint-disable-next-line @typescript-eslint/no-var-requires
// const batchSecretRequestWithNoOverride = require('../../../data/batch-secrets-no-override.json');
// // eslint-disable-next-line @typescript-eslint/no-var-requires
// const batchSecretRequestWithOverrides = require('../../../data/batch-secrets-with-overrides.json');

// // eslint-disable-next-line @typescript-eslint/no-var-requires
// const batchSecretRequestWithBadRequest = require('../../../data/batch-create-secrets-with-some-missing-params.json');

// let server: any;
// beforeAll(async () => {
//   server = await main;
// });

// afterAll(async () => {
//   server.close();
// });

// describe("GET /api/v2/secrets", () => {
//   describe("Get secrets via JTW", () => {
//     test("should create secrets and read secrets via jwt", async () => {
//       try {
//         // get login details 
//         const loginResponse = await getJWTFromTestUser()

//         // create creates 
//         const createSecretsResponse = await request(server)
//           .post("/api/v2/secrets/batch")
//           .set('Authorization', `Bearer ${loginResponse.token}`)
//           .send({
//             workspaceId: testWorkspaceId,
//             environment: "dev",
//             requests: batchSecretRequestWithNoOverride
//           })

//         expect(createSecretsResponse.statusCode).toBe(200)


//         const getSecrets = await request(server)
//           .get("/api/v2/secrets")
//           .set('Authorization', `Bearer ${loginResponse.token}`)
//           .query({
//             workspaceId: testWorkspaceId,
//             environment: "dev"
//           })

//         expect(getSecrets.statusCode).toBe(200)
//         expect(getSecrets.body).toHaveProperty("secrets")
//         expect(getSecrets.body.secrets).toHaveLength(3)
//         expect(getSecrets.body.secrets).toBeInstanceOf(Array);

//         getSecrets.body.secrets.forEach((secret: any) => {
//           expect(secret).toHaveProperty('_id');
//           expect(secret._id).toBeTruthy();

//           expect(secret).toHaveProperty('version');
//           expect(secret.version).toBeTruthy();

//           expect(secret).toHaveProperty('workspace');
//           expect(secret.workspace).toBeTruthy();

//           expect(secret).toHaveProperty('type');
//           expect(secret.type).toBeTruthy();

//           expect(secret).toHaveProperty('tags');
//           expect(secret.tags).toHaveLength(0);

//           expect(secret).toHaveProperty('environment');
//           expect(secret.environment).toEqual("dev");

//           expect(secret).toHaveProperty('secretKeyCiphertext');
//           expect(secret.secretKeyCiphertext).toBeTruthy();

//           expect(secret).toHaveProperty('secretKeyIV');
//           expect(secret.secretKeyIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretKeyTag');
//           expect(secret.secretKeyTag).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueCiphertext');
//           expect(secret.secretValueCiphertext).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueIV');
//           expect(secret.secretValueIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueTag');
//           expect(secret.secretValueTag).toBeTruthy();

//           expect(secret).toHaveProperty('secretCommentCiphertext');
//           expect(secret.secretCommentCiphertext).toBeFalsy();

//           expect(secret).toHaveProperty('secretCommentIV');
//           expect(secret.secretCommentIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretCommentTag');
//           expect(secret.secretCommentTag).toBeTruthy();

//           expect(secret).toHaveProperty('createdAt');
//           expect(secret.createdAt).toBeTruthy();

//           expect(secret).toHaveProperty('updatedAt');
//           expect(secret.updatedAt).toBeTruthy();
//         });
//       } finally {
//         // clean up
//         await deleteAllSecrets()
//       }
//     })

//     test("Get secrets via jwt when personal overrides exist", async () => {
//       try {
//         // get login details 
//         const loginResponse = await getJWTFromTestUser()

//         // create creates 
//         const createSecretsResponse = await request(server)
//           .post("/api/v2/secrets/batch")
//           .set('Authorization', `Bearer ${loginResponse.token}`)
//           .send({
//             workspaceId: testWorkspaceId,
//             environment: "dev",
//             requests: batchSecretRequestWithOverrides
//           })

//         expect(createSecretsResponse.statusCode).toBe(200)

//         const getSecrets = await request(server)
//           .get("/api/v2/secrets")
//           .set('Authorization', `Bearer ${loginResponse.token}`)
//           .query({
//             workspaceId: testWorkspaceId,
//             environment: "dev"
//           })

//         expect(getSecrets.statusCode).toBe(200)
//         expect(getSecrets.body).toHaveProperty("secrets")
//         expect(getSecrets.body.secrets).toHaveLength(2)
//         expect(getSecrets.body.secrets).toBeInstanceOf(Array);

//         getSecrets.body.secrets.forEach((secret: any) => {
//           expect(secret).toHaveProperty('_id');
//           expect(secret._id).toBeTruthy();

//           expect(secret).toHaveProperty('version');
//           expect(secret.version).toBeTruthy();

//           expect(secret).toHaveProperty('workspace');
//           expect(secret.workspace).toBeTruthy();

//           expect(secret).toHaveProperty('type');
//           expect(secret.type).toBeTruthy();

//           expect(secret).toHaveProperty('tags');
//           expect(secret.tags).toHaveLength(0);

//           expect(secret).toHaveProperty('environment');
//           expect(secret.environment).toEqual("dev");

//           expect(secret).toHaveProperty('secretKeyCiphertext');
//           expect(secret.secretKeyCiphertext).toBeTruthy();

//           expect(secret).toHaveProperty('secretKeyIV');
//           expect(secret.secretKeyIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretKeyTag');
//           expect(secret.secretKeyTag).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueCiphertext');
//           expect(secret.secretValueCiphertext).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueIV');
//           expect(secret.secretValueIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueTag');
//           expect(secret.secretValueTag).toBeTruthy();

//           expect(secret).toHaveProperty('secretCommentCiphertext');
//           expect(secret.secretCommentCiphertext).toBeFalsy();

//           expect(secret).toHaveProperty('secretCommentIV');
//           expect(secret.secretCommentIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretCommentTag');
//           expect(secret.secretCommentTag).toBeTruthy();

//           expect(secret).toHaveProperty('createdAt');
//           expect(secret.createdAt).toBeTruthy();

//           expect(secret).toHaveProperty('updatedAt');
//           expect(secret.updatedAt).toBeTruthy();
//         });
//       } finally {
//         // clean up
//         await deleteAllSecrets()
//       }
//     })
//   })

//   describe("fetch secrets via service token", () => {
//     test("Get secrets via jwt when personal overrides exist", async () => {
//       try {
//         // get login details 
//         const loginResponse = await getJWTFromTestUser()

//         // create creates 
//         const createSecretsResponse = await request(server)
//           .post("/api/v2/secrets/batch")
//           .set('Authorization', `Bearer ${loginResponse.token}`)
//           .send({
//             workspaceId: testWorkspaceId,
//             environment: "dev",
//             requests: batchSecretRequestWithOverrides
//           })

//         expect(createSecretsResponse.statusCode).toBe(200)

//         // now use the service token to fetch secrets
//         const serviceToken = await getServiceTokenFromTestUser()

//         const getSecrets = await request(server)
//           .get("/api/v2/secrets")
//           .set('Authorization', `Bearer ${serviceToken}`)
//           .query({
//             workspaceId: testWorkspaceId,
//             environment: "dev"
//           })

//         expect(getSecrets.statusCode).toBe(200)
//         expect(getSecrets.body).toHaveProperty("secrets")
//         expect(getSecrets.body.secrets).toHaveLength(2)
//         expect(getSecrets.body.secrets).toBeInstanceOf(Array);

//         getSecrets.body.secrets.forEach((secret: any) => {
//           expect(secret).toHaveProperty('_id');
//           expect(secret._id).toBeTruthy();

//           expect(secret).toHaveProperty('version');
//           expect(secret.version).toBeTruthy();

//           expect(secret).toHaveProperty('workspace');
//           expect(secret.workspace).toBeTruthy();

//           expect(secret).toHaveProperty('type');
//           expect(secret.type).toBeTruthy();

//           expect(secret).toHaveProperty('tags');
//           expect(secret.tags).toHaveLength(0);

//           expect(secret).toHaveProperty('environment');
//           expect(secret.environment).toEqual("dev");

//           expect(secret).toHaveProperty('secretKeyCiphertext');
//           expect(secret.secretKeyCiphertext).toBeTruthy();

//           expect(secret).toHaveProperty('secretKeyIV');
//           expect(secret.secretKeyIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretKeyTag');
//           expect(secret.secretKeyTag).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueCiphertext');
//           expect(secret.secretValueCiphertext).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueIV');
//           expect(secret.secretValueIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueTag');
//           expect(secret.secretValueTag).toBeTruthy();

//           expect(secret).toHaveProperty('secretCommentCiphertext');
//           expect(secret.secretCommentCiphertext).toBeFalsy();

//           expect(secret).toHaveProperty('secretCommentIV');
//           expect(secret.secretCommentIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretCommentTag');
//           expect(secret.secretCommentTag).toBeTruthy();

//           expect(secret).toHaveProperty('createdAt');
//           expect(secret.createdAt).toBeTruthy();

//           expect(secret).toHaveProperty('updatedAt');
//           expect(secret.updatedAt).toBeTruthy();
//         });
//       } finally {
//         // clean up
//         await deleteAllSecrets()
//       }
//     })

//     test("should create secrets and read secrets via service token when no overrides", async () => {
//       try {
//         // get login details 
//         const loginResponse = await getJWTFromTestUser()

//         // create secrets 
//         const createSecretsResponse = await request(server)
//           .post("/api/v2/secrets/batch")
//           .set('Authorization', `Bearer ${loginResponse.token}`)
//           .send({
//             workspaceId: testWorkspaceId,
//             environment: "dev",
//             requests: batchSecretRequestWithNoOverride
//           })

//         expect(createSecretsResponse.statusCode).toBe(200)


//         // now use the service token to fetch secrets
//         const serviceToken = await getServiceTokenFromTestUser()

//         const getSecrets = await request(server)
//           .get("/api/v2/secrets")
//           .set('Authorization', `Bearer ${serviceToken}`)
//           .query({
//             workspaceId: testWorkspaceId,
//             environment: "dev"
//           })

//         expect(getSecrets.statusCode).toBe(200)
//         expect(getSecrets.body).toHaveProperty("secrets")
//         expect(getSecrets.body.secrets).toHaveLength(3)
//         expect(getSecrets.body.secrets).toBeInstanceOf(Array);

//         getSecrets.body.secrets.forEach((secret: any) => {
//           expect(secret).toHaveProperty('_id');
//           expect(secret._id).toBeTruthy();

//           expect(secret).toHaveProperty('version');
//           expect(secret.version).toBeTruthy();

//           expect(secret).toHaveProperty('workspace');
//           expect(secret.workspace).toBeTruthy();

//           expect(secret).toHaveProperty('type');
//           expect(secret.type).toBeTruthy();

//           expect(secret).toHaveProperty('tags');
//           expect(secret.tags).toHaveLength(0);

//           expect(secret).toHaveProperty('environment');
//           expect(secret.environment).toEqual("dev");

//           expect(secret).toHaveProperty('secretKeyCiphertext');
//           expect(secret.secretKeyCiphertext).toBeTruthy();

//           expect(secret).toHaveProperty('secretKeyIV');
//           expect(secret.secretKeyIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretKeyTag');
//           expect(secret.secretKeyTag).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueCiphertext');
//           expect(secret.secretValueCiphertext).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueIV');
//           expect(secret.secretValueIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretValueTag');
//           expect(secret.secretValueTag).toBeTruthy();

//           expect(secret).toHaveProperty('secretCommentCiphertext');
//           expect(secret.secretCommentCiphertext).toBeFalsy();

//           expect(secret).toHaveProperty('secretCommentIV');
//           expect(secret.secretCommentIV).toBeTruthy();

//           expect(secret).toHaveProperty('secretCommentTag');
//           expect(secret.secretCommentTag).toBeTruthy();

//           expect(secret).toHaveProperty('createdAt');
//           expect(secret.createdAt).toBeTruthy();

//           expect(secret).toHaveProperty('updatedAt');
//           expect(secret.updatedAt).toBeTruthy();
//         });
//       } finally {
//         // clean up
//         await deleteAllSecrets()
//       }
//     })
//   })

//   describe("create secrets via JWT", () => {
//     test("Create secrets via jwt when some requests have missing required parameters", async () => {
//       // get login details 
//       const loginResponse = await getJWTFromTestUser()

//       // create creates 
//       const createSecretsResponse = await request(server)
//         .post("/api/v2/secrets/batch")
//         .set('Authorization', `Bearer ${loginResponse.token}`)
//         .send({
//           workspaceId: testWorkspaceId,
//           environment: "dev",
//           requests: batchSecretRequestWithBadRequest
//         })

//       const allSecretsInDB = await getAllSecrets()

//       expect(createSecretsResponse.statusCode).toBe(500) // TODO should be set to 400 
//       expect(allSecretsInDB).toHaveLength(0)
//     })
//   })
// })