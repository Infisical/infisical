export const MODEL_ID = "typesafe-ai/jev";
export const MIN_SELECTED_PROBABILITY = 0.95;

export const QUESTIONS = Object.freeze({
  fileRole: Object.freeze({
    type: "choice",
    instructions: "Classify the file's role from the structural evidence only. Treat path flags, names, and labels as advisory, not proof of safety. Tokens are privacy-redacted structural categories and aliases, not source code. Metadata-only context or truncated tokens may omit relevant behavior; choose unknown when the evidence is insufficient.",
    criteria: Object.freeze({
      test: "The file implements tests or test fixtures.",
      application: "The file implements application or operational behavior.",
      documentation: "The file documents usage or provides examples.",
      unknown: "The file's role cannot be determined from the evidence."
    })
  }),
  credentialUse: Object.freeze({
    type: "choice",
    instructions: "Classify how the candidate credential is used from the structural evidence only. A test path, fixture path, or placeholder flag does not establish isolation. Metadata-only context contains no code-use evidence. A redacted token window, especially when truncated, may omit external calls: their absence never proves isolated or mock use. Select isolated or mock only with affirmative evidence of that boundary; otherwise choose unknown when use cannot be determined.",
    criteria: Object.freeze({
      isolated: "The candidate is confined to local test data or assertions without external authentication.",
      mock: "The candidate is used only by a mocked authentication or service boundary.",
      external: "The candidate is used for authentication to a real external service or resource.",
      unknown: "The candidate's use or isolation cannot be determined from the evidence."
    })
  }),
  placeholder: Object.freeze({
    type: "choice",
    instructions: "Assess whether the structural evidence supports a deliberately synthetic placeholder. The credential value and all literal contents are intentionally absent; do not reconstruct them from token categories or symbol aliases. The placeholder flag is advisory and does not establish isolation or safety. Metadata-only context or truncated tokens may be insufficient; choose unknown when the available evidence does not distinguish synthetic from real credentials.",
    criteria: Object.freeze({
      likely: "The evidence supports a deliberately synthetic test placeholder.",
      unlikely: "The evidence supports a real credential rather than a synthetic placeholder.",
      unknown: "The evidence does not establish whether the candidate is synthetic."
    })
  })
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function classifyResponse(result) {
  const invalid = { status: "unavailable", reason: "invalid-response" };
  if (!isRecord(result) || !isRecord(result.answers)) return invalid;
  if (Object.keys(result.answers).length !== Object.keys(QUESTIONS).length) return invalid;

  const answers = {};
  const probabilities = {};
  for (const [id, question] of Object.entries(QUESTIONS)) {
    if (!Object.hasOwn(result.answers, id)) return invalid;
    const answer = result.answers[id];
    if (!isRecord(answer) || answer.type !== "choice") return invalid;
    if (typeof answer.choice !== "string" || !Object.hasOwn(question.criteria, answer.choice)) return invalid;
    const distribution = answer.probabilities;
    const options = Object.keys(question.criteria);
    if (!isRecord(distribution) || Object.keys(distribution).length !== options.length) return invalid;
    if (!options.every((option) => Object.hasOwn(distribution, option))) return invalid;
    const values = Object.values(distribution);
    if (!values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return invalid;
    if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) return invalid;
    if (values.some((value) => value > distribution[answer.choice] + 1e-6)) return invalid;
    answers[id] = answer.choice;
    probabilities[id] = Object.fromEntries(options.map((option) => [option, distribution[option]]));
  }

  const uncertain = Object.entries(answers).some(([id, choice]) =>
    choice === "unknown" || probabilities[id][choice] < MIN_SELECTED_PROBABILITY
  );
  const supportsFixture = answers.fileRole === "test"
    && ["isolated", "mock"].includes(answers.credentialUse)
    && answers.placeholder === "likely";
  return {
    status: "classified",
    assessment: uncertain ? "uncertain" : supportsFixture ? "likely-test-fixture" : "needs-review",
    answers,
    probabilities
  };
}

export async function classify(state, { apiKey, evaluate, timeoutMs = 15000 } = {}) {
  if (!evaluate && (typeof apiKey !== "string" || !apiKey.trim())) {
    return { status: "unavailable", reason: "missing-api-key" };
  }

  const duration = Number.isInteger(timeoutMs) && timeoutMs >= 0 && timeoutMs <= 2147483647
    ? timeoutMs : 15000;
  const abortSignal = AbortSignal.timeout(duration);
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "unavailable", reason: "timeout" }), duration);
  });

  try {
    return await Promise.race([
      timeout,
      (async () => {
        let model = MODEL_ID;
        let evaluator = evaluate;
        if (!evaluator) {
          const [{ experimental_evaluate }, { createGateway }] = await Promise.all([
            import("ai"),
            import("@ai-sdk/gateway")
          ]);
          evaluator = experimental_evaluate;
          model = createGateway({ apiKey }).evaluationModel(MODEL_ID);
        }
        abortSignal.throwIfAborted();
        const result = await evaluator({
          model,
          state,
          questions: QUESTIONS,
          maxRetries: 0,
          abortSignal,
          providerOptions: { gateway: { zeroDataRetention: true } }
        });
        abortSignal.throwIfAborted();
        return classifyResponse(result);
      })()
    ]);
  } catch (error) {
    let reason = new Map([
      [401, "authentication-failed"], [403, "authentication-failed"],
      [402, "payment-required"], [429, "rate-limited"]
    ]).get(error?.statusCode) ?? "request-failed";
    if (["AI_InvalidResponseDataError", "AI_TypeValidationError", "AI_JSONParseError"].includes(error?.name)) {
      reason = "invalid-response";
    }
    if (abortSignal.aborted) reason = "timeout";
    return { status: "unavailable", reason };
  } finally {
    clearTimeout(timer);
  }
}
