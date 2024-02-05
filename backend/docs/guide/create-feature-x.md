# Guide on creating a feature in Infisical backend

Let's say you want to implement a new feature, call it feature-x for name sake. These are steps to follow.

## Database model change

If there is a database change, we must first address this to generate the database schemas for us to use.

| Create a `.env.migration` for setting the db connection uri for migration scripts or you can just export the env DB_CONNECTION_URI

1. if you have a new table, then go to `/src/db/schemas/models.ts` and update `TableName` enum to have the new table name.
2. Then create a new migration file by running `npm run migration:new`, type the name. Keep it something related to what your about to do. For now `feature-x`
3. Now go to `/src/db/migrations/<timestamp>_<feature-x>.ts`
4. Here update both the function `up` and `down` to create/alter the postgres fields on migration up and to revert it back on migration down. [Keeping it idempotent](https://github.com/graphile/migrate/blob/main/docs/idempotent-examples.md).

### Generate TS schemas

Typically you would need to know write TS types for knex type sense. But we have automated this process

1. Start the server
2. Run `npm run migration:latest` to apply all the changes to db
3. Run `npm run generate:schema`. This will generate the type and schema using [zod](https://github.com/colinhacks/zod) in `/src/db/schemas` folder.
4. Update the barrel export in `schema/index` and apply the new tables names in `/src/@types/knex.d.ts`. This will allow knex js to have typesense.

## Business Logic

With the database changes generated. Now let's create the APIs for `feature-x`.

1. Run `npm run generate:component`
2. Select 1 that is service component
3. Type service name in dashcase. Like `feature-x`

This will create a folder inside `/src/services` with `feature-x` and 3 files

1. `feature-x-dal`: The Database Access Layer function
2. `feature-x-service`: The service layer where all bussiness logic happens
3. `feature-x-type`: Types used by feature-x

There are more layers like for reusable shared function u can setup a file called `feature-x-fns`

You can use the custom infisical function `ormify` inside `src/lib/knex` to do simple db operations inside DAL.

## Connecting the service layer with server layer

All the server related logic happens inside `/src/server`. To connect the service layer inside server layer we use fastify plugins for dependency injection

1. Add the service type inside `fastify.d.ts` file below `service` namespace of a FastifyServerInstance type
2. Now go to `/src/server/routes/index.ts`, instantiate the `feature-x` required dependencies like DAL layer and service layer and then pass it to `fastify.register("service,{...dependencies})`
3. With this the service layer will be accessibile inside all routes under fastify service instance. It can be accessed with `server.services.<service name register>.<fn>`

## Writing the routes

1. To create a route component run `npm generate:component`
2. Select option 3 by typing it out and then type the router name in dashcase.
3. Provide the version number

This will generate a router file inside `src/server/routes/v<version-number>/<router component name>`

1. Add your logic to connect with service layer accordingly
2. Then import the router component inside the version folder index.ts. Example, If the router component was inside v1, import the the function inside `v1/index.ts`
3. Finally register it under proper prefix to access it.

The above contains the backend folder structure. All the contribution towards backend must follow the rules

- **scripts**: Contains all the reusable scripts used in backend automation like running migration, generating SQL schemas
- **e2e-test**: The integration test for the APIs
- **src**: Source code of backend

## Src

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
