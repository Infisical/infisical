/* eslint-disable */
// No-op seam left behind after PostHog was removed. Call sites stay in place so wiring up a new
// analytics provider only means filling in these two methods.
class Capturer {
  capture(_item: string, _properties?: Record<string, unknown>) {}

  identify(_id: string, _email?: string) {}
}

export default class Telemetry {
  static instance: Capturer;

  constructor() {
    if (!Telemetry.instance) {
      Telemetry.instance = new Capturer();
    }
  }

  getInstance() {
    return Telemetry.instance;
  }
}
