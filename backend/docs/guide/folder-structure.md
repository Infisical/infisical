# Folder structure

```
.
├── scripts
├── e2e-test
└── src/
    ├── @types/
    │   ├── knex.d.ts
    │   └── fastify.d.ts
    ├── db/
    │   ├── migrations
    │   ├── schemas
    │   └── seed
    ├── lib/
    │   ├── fn
    │   ├── date
    │   └── config
    ├── queue
    ├── server/
    │   ├── routes/
    │   │   ├── v1
    │   │   └── v2
    │   ├── plugins
    │   └── config
    ├── services/
    │   ├── auth
    │   ├── org
    │   └── project/
    │       ├── project-service.ts
    │       ├── project-types.ts
    │       └── project-dal.ts
    └── ee/
        ├── routes
        └── services
```

The above contains the backend folder structure. All the contribution towards backend must follow the rules

- **scripts**: Contains all the reusable scripts used in backend automation like running migration, generating SQL schemas
- **e2e-test**: The integration test for the APIs
- **src**: Source code of backend

## SRC

- **@types**: The type definition of some libraries like fastify, knex
- **db**: Knexjs configuration required for database. Includes migration, seed files and sql type schemas
- **lib**: Stateless reusable functions used throught code base
- **queue**: Infisical queue system based on bullmq

### Server

- Anything related to fastify/service should be scoped inside here.
- It contains the routes, fastify plugins, server configurations
- Routes folder contains various version of routes seperated into v1,v2

### Services

- Core bussiness logic for all operations
- Each service component follows co-location principle that is related things should be kept together
- Each service component contains

1. **dal**: The Database Access Layer function that contains all the db operations
2. **service**: The service layer containing all the bussiness logic
3. **type**: The type definition used inside the service component
4. **fns**: Optional component to share reusable functions from a service related to another
5. **queue**: Optional component to put queue specific logic for a component like `secret-queue.ts`

## EE

- Follows same pattern as above with an exception of licensn change from MIT -> Infisical Properitary License

### Notes

- All the services are interconnected at `/src/server/routes/index.ts`. We follow simple dependency injection principle
- All files should be in dashcases.
- Classes should not be used in codebase. Use simple functions to keep it simple
- All commited code must be linted properly by running `npm run lint:fix` and type checked using `npm run type:check`
- Try to avoid inter service shared logic as much as possible
- A controller inside a router component should try to keep it calling only one service layer. This rule could have exception when another service
  like `audit-log` needs access to request object data. Then controller will call both the functions
