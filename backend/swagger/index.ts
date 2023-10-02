/* eslint-disable @typescript-eslint/no-var-requires */
const swaggerAutogen = require("swagger-autogen")({ openapi: "3.0.0" });
const fs = require("fs").promises;
const yaml = require("js-yaml");

/**
 * Generates OpenAPI specs for all Infisical API endpoints:
 * - spec.json in /backend for api-serving
 * - spec.yaml in /docs for API reference
 */
const generateOpenAPISpec = async () => {
  const doc = {
    info: {
      title: "Infisical API",
      description: "List of all available APIs that can be consumed",
    },
    host: ["https://infisical.com"],
    servers: [
      {
        url: "https://infisical.com",
        description: "Production server",
      },
      {
        url: "http://localhost:8080",
        description: "Local server",
      },
    ],
    securityDefinitions: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "This security definition uses the HTTP 'bearer' scheme, which allows the client to authenticate using a JSON Web Token (JWT) that is passed in the Authorization header of the request.",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: 'This security definition uses an API key, which is passed in the header of the request as the value of the "X-API-Key" header. The client must provide a valid key in order to access the API.',
      },
    },
    definitions: {
      CurrentUser: {
        _id: "",
        email: "johndoe@gmail.com",
        firstName: "John",
        lastName: "Doe",
        publicKey: "johns_nacl_public_key",
        encryptedPrivateKey: "johns_enc_nacl_private_key",
        iv: "iv_of_enc_nacl_private_key",
        tag: "tag_of_enc_nacl_private_key",
        updatedAt: "2023-01-13T14:16:12.210Z",
        createdAt: "2023-01-13T14:16:12.210Z",
      },
      Membership: {
        user: {
          _id: "",
          email: "johndoe@gmail.com",
          firstName: "John",
          lastName: "Doe",
          publicKey: "johns_nacl_public_key",
          updatedAt: "2023-01-13T14:16:12.210Z",
          createdAt: "2023-01-13T14:16:12.210Z",
        },
        workspace: "",
        role: "admin",
      },
      MembershipOrg: {
        user: {
          _id: "",
          email: "johndoe@gmail.com",
          firstName: "John",
          lastName: "Doe",
          publicKey: "johns_nacl_public_key",
          updatedAt: "2023-01-13T14:16:12.210Z",
          createdAt: "2023-01-13T14:16:12.210Z",
        },
        organization: "",
        role: "owner",
        status: "accepted",
      },
      Organization: {
        _id: "",
        name: "Acme Corp.",
        customerId: "",
      },
      Project: {
        name: "My Project",
        organization: "",
        environments: [{
          name: "development",
          slug: "dev",
        }],
      },
      ProjectKey: {
        encryptedkey: "",
        nonce: "",
        sender: {
          publicKey: "senders_nacl_public_key",
        },
        receiver: "",
        workspace: "",
      },
      CreateSecret: {
        type: "shared",
        secretKeyCiphertext: "",
        secretKeyIV: "",
        secretKeyTag: "",
        secretValueCiphertext: "",
        secretValueIV: "",
        secretValueTag: "",
        secretCommentCiphertext: "",
        secretCommentIV: "",
        secretCommentTag: "", 
      },
      UpdateSecret: {
        id: "",
        secretKeyCiphertext: "",
        secretKeyIV: "",
        secretKeyTag: "",
        secretValueCiphertext: "",
        secretValueIV: "",
        secretValueTag: "",
        secretCommentCiphertext: "",
        secretCommentIV: "",
        secretCommentTag: "",
      },
      Secret: {
        _id: "",
        version: 1,
        workspace : "",
        type: "shared",
        user: null,
        secretKeyCiphertext: "",
        secretKeyIV: "",
        secretKeyTag: "",
        secretValueCiphertext: "",
        secretValueIV: "",
        secretValueTag: "",
        secretCommentCiphertext: "",
        secretCommentIV: "",
        secretCommentTag: "",
        updatedAt: "2023-01-13T14:16:12.210Z",
        createdAt: "2023-01-13T14:16:12.210Z",
      },
      Log: {
        _id: "",
        user: {
          _id: "",
          email: "johndoe@gmail.com",
          firstName: "John",
          lastName: "Doe",
        },
        workspace: "",
        actionNames: [
          "addSecrets",
        ],
        actions: [
          {
            name: "addSecrets",
            user: "",
            workspace: "",
            payload: [
              {
                oldSecretVersion: "",
                newSecretVersion: "",
              },
            ],
          },
        ],
        channel: "cli",
        ipAddress: "192.168.0.1",
        updatedAt: "2023-01-13T14:16:12.210Z",
        createdAt: "2023-01-13T14:16:12.210Z",
      },
      SecretSnapshot: {
        workspace: "",
        version: 1,
        secretVersions: [
          {
            _id: "",
          },
        ],
      },
      SecretVersion: {
        _id: "",
        secret: "",
        version: 1,
        workspace: "",
        type: "shared",
        user: "",
        environment: "dev",
        isDeleted: "",
        secretKeyCiphertext: "",
        secretKeyIV: "",
        secretKeyTag: "",
        secretValueCiphertext: "",
        secretValueIV: "",
        secretValueTag: "", 
      },
      ServiceTokenData: {
        _id: "",
        name: "",
        workspace: "",
        environment: "",
        user: {
          _id: "",
          firstName: "",
          lastName: "",
        },
        expiresAt: "2023-01-13T14:16:12.210Z",
        encryptedKey: "",
        iv: "",
        tag: "",
        updatedAt: "2023-01-13T14:16:12.210Z",
        createdAt: "2023-01-13T14:16:12.210Z",
      },
    },
  };

  const outputJSONFile = "../spec.json";
  const outputYAMLFile = "../docs/spec.yaml";
  const endpointsFiles = ["../src/index.ts"];

  const spec = await swaggerAutogen(outputJSONFile, endpointsFiles, doc);
  
  await fs.writeFile(outputYAMLFile, yaml.dump(spec.data));
}

generateOpenAPISpec();