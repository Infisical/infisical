import { AxiosError, AxiosResponse } from "axios";

import { BadRequestError } from "@app/lib/errors";
import {
  listIncidentIoSchedules,
  listIncidentIoShiftsAt,
  TIncidentIoScheduleEntry
} from "@app/services/app-connection/incident-io";

import { AUTO_APPROVAL_REQUESTER_SUBJECT, TAutoApprovalContext } from "../auto-approval-types";
import {
  INCIDENT_IO_AUTO_APPROVAL_PROVIDER,
  IncidentIoRequesterConstraint,
  TIncidentIoRequesterFacts
} from "./incident-io-auto-approval-provider";

vi.mock("@app/services/app-connection/incident-io", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/incident-io")>()),
  listIncidentIoSchedules: vi.fn(),
  listIncidentIoShiftsAt: vi.fn()
}));

const ctx: TAutoApprovalContext = { requester: { email: "Dev@Acme.com" } };

const { resolve, constraints } = INCIDENT_IO_AUTO_APPROVAL_PROVIDER.subjects[AUTO_APPROVAL_REQUESTER_SUBJECT];
const { test: checkOnCall, listOptions, describeValues } = constraints[IncidentIoRequesterConstraint.OnCall];

const shift = (email?: string): TIncidentIoScheduleEntry => ({
  start_at: "2026-11-06T00:00:00Z",
  end_at: "2026-11-07T00:00:00Z",
  user: { id: "u1", email }
});

const evaluate = async (values: string[], allValues = values, context = ctx) => {
  const facts = (await resolve(
    {} as Parameters<typeof resolve>[0],
    null,
    context,
    [IncidentIoRequesterConstraint.OnCall],
    {} as Parameters<typeof resolve>[4],
    { [IncidentIoRequesterConstraint.OnCall]: allValues }
  )) as TIncidentIoRequesterFacts;
  return checkOnCall(facts, values, context);
};

const scheduleId = (n: number) => `01HZZZZZZZZZZZZZZZZZZZZZZ${n}`;
const [PRIMARY, SECONDARY, SHARED_A, SHARED_B, NAMED_LIKE_PRIMARY, NAMED_LIKE_DELETED, DELETED] = [
  1, 2, 3, 4, 5, 6, 9
].map(scheduleId);

describe("incident.io on-call check", () => {
  beforeEach(() => {
    vi.mocked(listIncidentIoSchedules)
      .mockReset()
      .mockResolvedValue([
        { id: PRIMARY, name: "Primary" },
        { id: SECONDARY, name: "Secondary" },
        { id: SHARED_A, name: "Shared" },
        { id: SHARED_B, name: "shared" },
        { id: NAMED_LIKE_PRIMARY, name: PRIMARY },
        { id: NAMED_LIKE_DELETED, name: DELETED }
      ]);
    vi.mocked(listIncidentIoShiftsAt)
      .mockReset()
      .mockImplementation(async (_conn, id) =>
        [PRIMARY, SHARED_A, NAMED_LIKE_PRIMARY, NAMED_LIKE_DELETED].includes(id)
          ? [shift("dev@acme.com")]
          : [shift("other@acme.com")]
      );
  });

  test("passes when the requester's email is on a current shift, in any case", async () => {
    expect(await evaluate(["primary"])).toEqual({ pass: true });
  });

  test("fails when someone else is on call", async () => {
    expect(await evaluate(["Secondary"])).toEqual({
      pass: false,
      reason: "The requester isn't on call in Secondary"
    });
  });

  test("never matches a shift whose user has no email", async () => {
    vi.mocked(listIncidentIoShiftsAt).mockResolvedValue([shift(undefined)]);
    expect((await evaluate(["Primary"])).pass).toBe(false);
  });

  test("fails a requester who has no email to match", async () => {
    await expect(evaluate(["Primary"], ["Primary"], { requester: { email: null } })).rejects.toThrow(BadRequestError);
  });

  test("a schedule ID names only that schedule, even if another schedule is named like it", async () => {
    vi.mocked(listIncidentIoShiftsAt).mockImplementation(async (_conn, id) =>
      id === NAMED_LIKE_PRIMARY ? [shift("dev@acme.com")] : [shift("other@acme.com")]
    );
    expect((await evaluate([PRIMARY])).pass).toBe(false);
    expect(vi.mocked(listIncidentIoShiftsAt).mock.calls.map(([, id]) => id)).toEqual([PRIMARY]);
  });

  test("a deleted schedule's ID can't be taken over by naming another schedule after it", async () => {
    expect((await evaluate([DELETED])).pass).toBe(false);
    expect(listIncidentIoShiftsAt).not.toHaveBeenCalled();
  });

  test("a name shared by two schedules never passes, but either schedule's ID does", async () => {
    const result = await evaluate(["Shared"]);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("More than one incident.io schedule is named Shared");

    expect(await evaluate([SHARED_A])).toEqual({ pass: true });
    expect(await evaluate(["Shared"], ["Shared", SHARED_A])).toMatchObject({ pass: false });
  });

  test("a schedule that can't be read doesn't stop another from passing", async () => {
    vi.mocked(listIncidentIoShiftsAt).mockImplementation(async (_conn, id) => {
      if (id === SECONDARY) {
        throw new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
          status: 403
        } as AxiosResponse);
      }
      return [shift("dev@acme.com")];
    });

    expect(await evaluate(["Secondary", "Primary"])).toEqual({ pass: true });
    expect((await evaluate(["Secondary"])).reason).toContain("Couldn't read who is on call in Secondary");
  });

  test("the picker saves schedule IDs, labelled by name", async () => {
    const options = await listOptions?.(
      {} as Parameters<typeof resolve>[0],
      { siblings: {} },
      {} as Parameters<typeof resolve>[4]
    );
    expect(options).toContainEqual({ value: PRIMARY, label: "Primary" });
    expect(options).toContainEqual({ value: SHARED_A, label: `Shared (${SHARED_A})` });
  });

  test("descriptions show a checked schedule's name for its ID", () => {
    const facts: TIncidentIoRequesterFacts = {
      schedules: [{ id: PRIMARY, name: "Primary", onCall: false, error: null }],
      ambiguousNames: []
    };
    expect(describeValues?.(facts, [PRIMARY, "Secondary", DELETED])).toEqual(["Primary", "Secondary", DELETED]);
  });

  test("explains a schedule incident.io doesn't have", async () => {
    expect(await evaluate(["Payments"])).toEqual({ pass: false, reason: "incident.io has no schedule named Payments" });
  });

  test("turns a failed schedule list into a readable error", async () => {
    vi.mocked(listIncidentIoSchedules).mockRejectedValue(
      new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, { status: 401 } as AxiosResponse)
    );
    await expect(evaluate(["Primary"])).rejects.toThrow(
      "Couldn't read schedules from incident.io: incident.io rejected the connection's API key"
    );
  });
});
