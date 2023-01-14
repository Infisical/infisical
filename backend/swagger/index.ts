/* eslint-disable @typescript-eslint/no-var-requires */
const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' });
const fs = require('fs').promises;
const yaml = require('js-yaml');
const { secretSchema } = require('./schemas/index.ts');

/**
 * Generates OpenAPI specs for all Infisical API endpoints:
 * - spec.json in /backend for api-serving
 * - spec.yaml in /docs for API reference
 */
const generateOpenAPISpec = async () => {
  const doc = {
    info: {
      title: 'Infisical API',
      description: 'List of all available APIs that can be consumed',
    },
    host: ['https://infisical.com'],
    servers: [
      {
        url: 'https://infisical.com',
        description: 'Production server'
      },
      {
        url: 'http://localhost:8080',
        description: 'Local server'
      }
    ],
    securityDefinitions: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: "This security definition uses the HTTP 'bearer' scheme, which allows the client to authenticate using a JSON Web Token (JWT) that is passed in the Authorization header of the request."
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'This security definition uses an API key, which is passed in the header of the request as the value of the "X-API-Key" header. The client must provide a valid key in order to access the API.'
      }
    },
    definitions: {
      CurrentUser: {
        _id: '',
        email: '',
        firstName: '',
        lastName: '',
        publicKey: '',
        encryptedPrivateKey: '',
        iv: '',
        tag: '',
        updatedAt: '',
        createdAt: ''
      },
      Membership: {
        user: {
          _id: '',
          email: '',
          firstName: '',
          lastName: '',
          publicKey: '',
          updatedAt: '',
          createdAt: ''
        },
        workspace: '',
        role: 'admin'
      },
      ProjectKey: {
        encryptedkey: '',
        nonce: '',
        sender: {
          publicKey: ''
        },
        receiver: '',
        workspace: ''
      },
      CreateSecret: {
        type: 'shared',
        secretKeyCiphertext: '',
        secretKeyIV: '',
        secretKeyTag: '',
        secretValueCiphertext: '',
        secretValueIV: '',
        secretValueTag: '',
        secretCommentCiphertext: '',
        secretCommentIV: '',
        secretCommentTag: '' 
      },
      UpdateSecret: {
        id: '',
        secretKeyCiphertext: '',
        secretKeyIV: '',
        secretKeyTag: '',
        secretValueCiphertext: '',
        secretValueIV: '',
        secretValueTag: '',
        secretCommentCiphertext: '',
        secretCommentIV: '',
        secretCommentTag: ''
      },
      Secret: {
        _id: '',
        version: 1,
        workspace : '',
        type: 'shared',
        user: null,
        secretKeyCiphertext: '',
        secretKeyIV: '',
        secretKeyTag: '',
        secretValueCiphertext: '',
        secretValueIV: '',
        secretValueTag: '',
        secretCommentCiphertext: '',
        secretCommentIV: '',
        secretCommentTag: '',
        updatedAt: '',
        createdAt: ''
      },
      Log: {
        _id: '',
        user: {
          _id: '',
          email: '',
          firstName: '',
          lastName: ''
        },
        workspace: '',
        actionNames: [
          'addSecrets'
        ],
        actions: [
          {
            name: 'addSecrets',
            user: '',
            workspace: '',
            payload: [
              {
                oldSecretVersion: '',
                newSecretVersion: ''
              }
            ]
          }
        ],
        channel: 'cli',
        ipAddress: '192.168.0.1',
        updatedAt: '',
        createdAt: ''
      },
      SecretSnapshot: {
        workspace: '',
        version: 1,
        secretVersions: [
          {
            _id: ''
          }
        ]
      },
      SecretVersion: {
        _id: '',
        secret: '',
        version: 1,
        workspace: '',
        type: '',
        user: '',
        environment: '',
        isDeleted: '',
        secretKeyCiphertext: '',
        secretKeyIV: '',
        secretKeyTag: '',
        secretValueCiphertext: '',
        secretValueIV: '',
        secretValueTag: '', 
      }
    }
  };

  const outputJSONFile = '../spec.json';
  const outputYAMLFile = '../docs/spec.yaml';
  const endpointsFiles = ['../src/app.ts'];

  const spec = await swaggerAutogen(outputJSONFile, endpointsFiles, doc);
  await fs.writeFile(outputYAMLFile, yaml.dump(spec.data));
}

generateOpenAPISpec();
