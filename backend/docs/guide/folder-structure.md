# Backend Folder Structure Guide

```
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


The following outlines the backend folder structure. All contributions to the backend should adhere to these guidelines:

- **scripts**: This folder contains all reusable scripts for backend automation, such as running migrations and generating SQL schemas.
- **e2e-test**: Here you'll find integration tests for the APIs.
- **src**: This is the main directory for the source code of the backend.

## SRC

- **@types**: This directory holds the type definitions for certain libraries, such as Fastify and Knex.
- **db**: In this folder, you'll find the Knex.js configuration necessary for database operations, including migration, seed files, and SQL type schemas.
- **lib**: This directory is for stateless, reusable functions used throughout the codebase.
- **queue**: This folder contains the Infisical queue system, which is based on BullMQ.

### Server

- This section is dedicated to anything related to Fastify/service and should be contained within this scope.
- It includes routes, Fastify plugins, and server configurations.
- The routes folder is organized into various versions, separated into v1, v2, etc.

### Services

- This area handles the core business logic for all operations.
- Each service component adheres to the co-location principle, meaning related components are grouped together.
- Within each service component, you will find:
  1. **dal**: The Database Access Layer, containing all database operations.
  2. **service**: This is the service layer where all the business logic resides.
  3. **type**: Type definitions used within the service component.
  4. **fns**: An optional component for sharing reusable functions related to the service.
  5. **queue**: An optional component for queue-specific logic, such as `secret-queue.ts`.

## EE

- This follows the same organizational pattern as above, but with a notable change from the MIT License to the Infisical Proprietary License.

### Notes

- All services are interconnected at `/src/server/routes/index.ts`, where we employ a straightforward dependency injection principle.
- File naming should use dash-case.
- Instead of classes, the codebase relies on simple functions to maintain simplicity.
- All code committed must be thoroughly linted using `npm run lint:fix` and type-checked with `npm run type:check`.
- Efforts should be made to minimize shared logic between services.
- Controllers within a router component should generally invoke only one service layer. Exceptions may occur, such as when a service like `audit-log` requires access to request object data, necessitating calls to multiple functions.