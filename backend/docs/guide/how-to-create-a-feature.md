# Guide to Creating a Feature in Infisical's Backend

Suppose you're interested in implementing a new feature, let's call it "feature-x." Here are the steps you should follow:

## Database Model Change

If your feature involves a change in the database, you need to first address this to generate the necessary database schemas.

- Create a `.env.migration` file to set the database connection URI for migration scripts, or alternatively, export the `DB_CONNECTION_URI` environment variable.

1. If you're adding a new table, update the `TableName` enum in `/src/db/schemas/models.ts` to include the new table name.
2. Create a new migration file by running `npm run migration:new` and give it a relevant name, such as `feature-x`.
3. Navigate to `/src/db/migrations/<timestamp>_<feature-x>.ts`.
4. Modify both the `up` and `down` functions to create or alter Postgres fields on migration up and to revert these changes on migration down, ensuring idempotency as outlined [here](https://github.com/graphile/migrate/blob/main/docs/idempotent-examples.md).

### Generating TS Schemas

While typically you would need to manually write TS types for Knex type-sense, we have automated this process:

1. Start the server.
2. Run `npm run migration:latest` to apply all database changes.
3. Execute `npm run generate:schema` to automatically generate types and schemas using [zod](https://github.com/colinhacks/zod) in the `/src/db/schemas` folder.
4. Update the barrel export in `schema/index` and include the new tables in `/src/@types/knex.d.ts` to enable type-sensing in Knex.js.

## Business Logic

Once the database changes are in place, it's time to create the APIs for `feature-x`:

1. Execute `npm run generate:component`.
2. Choose option 1 for the service component.
3. Name the service in dash-case, like `feature-x`.

This will create a `feature-x` folder in `/src/services` containing three files:

1. `feature-x-dal`: The Database Access Layer functions.
2. `feature-x-service`: The service layer where all the business logic is handled.
3. `feature-x-type`: The types used by `feature-x`.

For reusable shared functions, set up a file named `feature-x-fns`.

Use the custom Infisical function `ormify` in `src/lib/knex` for simple database operations within the DAL.

## Connecting the Service Layer to the Server Layer

Server-related logic is handled in `/src/server`. To connect the service layer to the server layer, we use Fastify plugins for dependency injection:

1. Add the service type in the `fastify.d.ts` file under the `service` namespace of a FastifyServerInstance type.
2. In `/src/server/routes/index.ts`, instantiate the required dependencies for `feature-x`, such as the DAL and service layers, and then pass them to `fastify.register("service,{...dependencies})`.
3. This makes the service layer accessible within all routes under the Fastify service instance, accessed via `server.services.<registered service name>.<function>`.

## Writing the Routes

1. To create a route component, run `npm generate:component`.
2. Select option 3, type the router name in dash-case, and provide the version number.

This will generate a router file in `src/server/routes/v<version-number>/<router component name>`:

1. Implement your logic to connect with the service layer as needed.
2. Import the router component in the version folder's index.ts. For instance, if it's in v1, import it in `v1/index.ts`.
3. Finally, register it under the appropriate prefix for access.

## Backend Folder Structure

Contributions to the backend must adhere to the following structure:

- **scripts**: Contains reusable scripts for backend automation, like running migrations and generating SQL schemas.
- **e2e-test**: Integration tests for the APIs.
- **src**: The source code of the backend.

### Src

- **@types**: Type definitions for libraries like Fastify and Knex.
- **db**: Knex.js configuration for the database, including migration, seed files, and SQL type schemas.
- **lib**: Stateless, reusable functions used across the codebase.
- **queue**: Infisical's queue system based on BullMQ.

### Server

- Scope anything related to Fastify/service here.
- Includes routes, Fastify plugins, and server configurations.
- The routes folder contains various versions of routes separated into v1, v2, etc.

### Services

- Handles the core business logic for all operations.
- Follows the co-location principle: related components should be kept together.
- Each service component typically contains:

  1. **dal**: Database Access Layer functions for database operations
  2. **service**: The service layer containing business logic.
  3. **type**: Type definitions used within the service component.
  4. **fns**: An optional component for sharing reusable functions related to the service.
  5. **queue**: An optional component for queue-specific logic, like `secret-queue.ts`.

## EE

- Follows the same pattern as above, with the exception of a license change from MIT to Infisical Proprietary License.

### Notes

- All services are interconnected at `/src/server/routes/index.ts`, following the principle of simple dependency injection.
- Files should be named in dash-case.
- Avoid using classes in the codebase; opt for simple functions instead.
- All committed code must be properly linted using `npm run lint:fix` and type-checked with `npm run type:check`.
- Minimize shared logic between services as much as possible.
- Controllers within a router component should ideally call only one service layer, with exceptions for services like `audit-log` that require access to request object data.