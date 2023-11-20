// final prod build
const { build } = require("esbuild");

build({
  entryPoints: ["./src/app.ts"],
  minify: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  bundle: true,
  outfile: "dist/index.js",
  plugins: [],
})
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => {
    console.log("Finished bundling server..");
  });
