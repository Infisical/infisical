import Fasitfy from "fastify";

const fastify = Fasitfy({
  logger: true,
});

// Declare a route
fastify.get("/", async function handler(_request, _reply) {
  return { hello: "world changed" };
});

// Run the server!
const main = async () => {
  try {
    await fastify.listen({ port: 8000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

main();
