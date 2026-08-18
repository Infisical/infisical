// Invoked by `initialDeployHook` in render.yaml, which runs once after a preview's first
// successful deploy. Kept dependency-free so it runs under the production image, where
// devDependencies (tsx included) are pruned.

const { RENDER_EXTERNAL_URL, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, BOOTSTRAP_ORG } = process.env;

const missing = Object.entries({ RENDER_EXTERNAL_URL, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, BOOTSTRAP_ORG })
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(
    `Cannot bootstrap preview: ${missing.join(", ")} not set. Add them to the infisical-preview env group.`
  );
  process.exit(1);
}

const response = await fetch(`${RENDER_EXTERNAL_URL}/api/v1/admin/bootstrap`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD, organization: BOOTSTRAP_ORG })
});

const body = await response.text();

if (response.ok) {
  const { organization } = JSON.parse(body);
  console.log(`Bootstrapped ${BOOTSTRAP_EMAIL} into org ${organization.slug}`);
  process.exit(0);
}

if (body.includes("Instance has already been set up")) {
  console.log("Instance is already bootstrapped, nothing to do");
  process.exit(0);
}

console.error(`Bootstrap failed (${response.status}): ${body}`);
process.exit(1);
