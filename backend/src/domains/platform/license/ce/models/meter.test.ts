import { Meter } from "./meter";

describe("Meter.fromKey", () => {
  test("should return the meter for every key it defines", () => {
    // Setup
    const meters = Meter.all();

    // Action
    const found = meters.map((meter) => Meter.fromKey(meter.key));

    // Assert
    expect(found).toEqual(meters);
  });

  test("should return null for a key no meter defines", () => {
    // Action
    const found = Meter.fromKey("unknown_dimension");

    // Assert
    expect(found).toBeNull();
  });
});
