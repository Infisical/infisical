import assert from "node:assert/strict";
import test from "node:test";

import { classify, MODEL_ID, QUESTIONS } from "./classifier.mjs";

const state = Object.freeze({
  file: Object.freeze({ language: "javascript-typescript", testPath: true, fixturePath: false, documentationPath: false }),
  candidate: Object.freeze({ placeholder: true }),
  context: "redacted-token-window",
  tokens: Object.freeze(["describe", "test", "symbol-1"]),
  truncated: false
});

function response(choices = {}, probability = 0.97) {
  const selected = { fileRole: "test", credentialUse: "isolated", placeholder: "likely", ...choices };
  return {
    answers: Object.fromEntries(Object.entries(QUESTIONS).map(([id, question]) => {
      const options = Object.keys(question.criteria);
      return [id, {
        type: "choice",
        choice: selected[id],
        probabilities: Object.fromEntries(options.map((option) => [
          option, option === selected[id] ? probability : (1 - probability) / (options.length - 1)
        ]))
      }];
    }))
  };
}

test("high-probability fixture choices produce only an advisory assessment", async () => {
  for (const credentialUse of ["isolated", "mock"]) {
    const supplied = response({ credentialUse });
    const result = await classify(state, { evaluate: async () => supplied });
    assert.deepEqual(result, {
      status: "classified",
      assessment: "likely-test-fixture",
      answers: { fileRole: "test", credentialUse, placeholder: "likely" },
      probabilities: Object.fromEntries(Object.entries(supplied.answers).map(([id, answer]) => [id, answer.probabilities]))
    });
    assert.notEqual(result.probabilities.fileRole, supplied.answers.fileRole.probabilities);
  }
});

test("confident application, documentation, external use, or non-placeholder choices need review", async () => {
  for (const choices of [
    { fileRole: "application" }, { fileRole: "documentation" },
    { credentialUse: "external" }, { placeholder: "unlikely" }
  ]) {
    const result = await classify(state, { evaluate: async () => response(choices) });
    assert.equal(result.assessment, "needs-review");
  }
});

test("an unknown answer or a selected probability below 0.95 is uncertain", async () => {
  for (const id of Object.keys(QUESTIONS)) {
    const unknown = await classify(state, { evaluate: async () => response({ [id]: "unknown" }) });
    assert.equal(unknown.assessment, "uncertain");
    const low = response();
    low.answers[id] = response({}, 0.949999).answers[id];
    const uncertain = await classify(state, { evaluate: async () => low });
    assert.equal(uncertain.assessment, "uncertain");
  }
  const boundary = await classify(state, { evaluate: async () => response({}, 0.95) });
  assert.equal(boundary.assessment, "likely-test-fixture");
});

test("passes only the unchanged structural state and privacy-preserving evaluation options", async () => {
  let calls = 0;
  const before = JSON.stringify(state);
  await classify(state, {
    apiKey: "unit-test-key-not-a-credential",
    evaluate: async (request) => {
      calls += 1;
      assert.equal(request.state, state);
      assert.equal(request.model, MODEL_ID);
      assert.equal(request.questions, QUESTIONS);
      assert.equal(request.maxRetries, 0);
      assert.deepEqual(request.providerOptions, { gateway: { zeroDataRetention: true } });
      assert.ok(request.abortSignal instanceof AbortSignal);
      assert.equal(request.abortSignal.aborted, false);
      assert.deepEqual(Object.keys(request).sort(), ["abortSignal", "maxRetries", "model", "providerOptions", "questions", "state"]);
      for (const question of Object.values(request.questions)) {
        assert.equal(question.type, "choice");
        assert.equal(typeof question.instructions, "string");
        assert.ok(Object.hasOwn(question.criteria, "unknown"));
      }
      return response();
    }
  });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(state), before);
});

test("a missing or blank API key fails closed without invoking the SDK", async () => {
  for (const apiKey of [undefined, null, "", "   "]) {
    assert.deepEqual(await classify(state, { apiKey }), { status: "unavailable", reason: "missing-api-key" });
  }
});

test("questions explicitly address uncertainty in metadata-only and truncated evidence", async () => {
  for (const context of ["metadata-only", "redacted-token-window"]) {
    const limitedState = { ...state, context, tokens: [], truncated: true };
    const result = await classify(limitedState, {
      evaluate: async ({ state: supplied, questions }) => {
        assert.equal(supplied, limitedState);
        for (const question of Object.values(questions)) {
          assert.match(question.instructions, /metadata-only/i);
          assert.match(question.instructions, /truncated/);
          assert.match(question.instructions, /unknown/);
        }
        assert.match(questions.credentialUse.instructions, /absence never proves isolated or mock use/);
        assert.match(questions.credentialUse.instructions, /affirmative evidence/);
        return response({ credentialUse: "unknown" });
      }
    });
    assert.equal(result.assessment, "uncertain");
  }
});

test("malformed answers and incomplete or invalid probability distributions fail closed", async (t) => {
  const cases = {
    "missing result": () => undefined,
    "missing answers": () => ({}),
    "missing question": (value) => { delete value.answers.fileRole; return value; },
    "extra question": (value) => { value.answers.extra = value.answers.fileRole; return value; },
    "wrong type": (value) => { value.answers.fileRole.type = "score"; return value; },
    "invalid option": (value) => { value.answers.fileRole.choice = "safe"; return value; },
    "inherited option": (value) => { value.answers.fileRole.choice = "toString"; return value; },
    "missing distribution": (value) => { delete value.answers.fileRole.probabilities; return value; },
    "missing option": (value) => { delete value.answers.fileRole.probabilities.unknown; return value; },
    "extra option": (value) => { value.answers.fileRole.probabilities.extra = 0; return value; },
    "not normalized": (value) => { value.answers.fileRole.probabilities.test = 0.5; return value; },
    "not maximal": (value) => { value.answers.fileRole.choice = "application"; return value; }
  };
  for (const invalid of [NaN, Infinity, -Infinity, -0.1, 1.1, "0.97", null]) {
    cases[`invalid probability ${String(invalid)}`] = (value) => {
      value.answers.fileRole.probabilities.test = invalid;
      return value;
    };
  }
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, async () => {
      assert.deepEqual(await classify(state, { evaluate: async () => mutate(response()) }), {
        status: "unavailable", reason: "invalid-response"
      });
    });
  }
});

test("tolerates small floating-point distribution rounding without renormalizing", async () => {
  const supplied = response();
  supplied.answers.fileRole.probabilities.unknown += 0.0000001;
  const result = await classify(state, { evaluate: async () => supplied });
  assert.equal(result.assessment, "likely-test-fixture");
  assert.deepEqual(result.probabilities.fileRole, supplied.answers.fileRole.probabilities);
});

test("request rejection and synchronous exceptions reveal no exception details", async () => {
  for (const evaluate of [
    async () => { throw new Error("private provider response"); },
    () => { throw new Error("private provider response"); }
  ]) {
    assert.deepEqual(await classify(state, { evaluate }), { status: "unavailable", reason: "request-failed" });
  }
});

test("SDK validation errors are classified without exposing response details", async () => {
  for (const name of ["AI_InvalidResponseDataError", "AI_TypeValidationError", "AI_JSONParseError"]) {
    const evaluate = async () => { throw Object.assign(new Error("private response"), { name }); };
    assert.deepEqual(await classify(state, { evaluate }), { status: "unavailable", reason: "invalid-response" });
  }
});

test("authentication, rate-limit and credit errors are actionable without exposing provider messages", async () => {
  for (const [statusCode, reason] of [[401, "authentication-failed"], [403, "authentication-failed"], [402, "payment-required"], [429, "rate-limited"]]) {
    const evaluate = async () => { throw Object.assign(new Error("private provider response"), { statusCode }); };
    assert.deepEqual(await classify(state, { evaluate }), { status: "unavailable", reason });
  }
});

test("timeout bounds an evaluator that ignores its signal", { timeout: 1000 }, async () => {
  let signal;
  const result = await classify(state, {
    timeoutMs: 10,
    evaluate: ({ abortSignal }) => {
      signal = abortSignal;
      return new Promise(() => {});
    }
  });
  assert.deepEqual(result, { status: "unavailable", reason: "timeout" });
  assert.equal(signal.aborted, true);
});

test("an abort-aware evaluator also returns timeout rather than a request failure", { timeout: 1000 }, async () => {
  const result = await classify(state, {
    timeoutMs: 10,
    evaluate: ({ abortSignal }) => new Promise((_, reject) => {
      abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
    })
  });
  assert.deepEqual(result, { status: "unavailable", reason: "timeout" });
});

test("late evaluator rejection after timeout does not escape the classifier", { timeout: 1000 }, async () => {
  let rejectRequest;
  const result = await classify(state, {
    timeoutMs: 10,
    evaluate: () => new Promise((_, reject) => { rejectRequest = reject; })
  });
  rejectRequest(new Error("late private response"));
  assert.deepEqual(result, { status: "unavailable", reason: "timeout" });
  await new Promise((resolve) => setImmediate(resolve));
});
