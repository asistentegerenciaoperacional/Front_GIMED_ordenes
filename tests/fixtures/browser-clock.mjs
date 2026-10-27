// Loaded only by the historical browser journey's isolated fixture server.
// Date-only mocking leaves real timers and performance measurements untouched.
import { mock } from "node:test";
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-14T12:00:00.000Z") });
// Preserve distinct creation timestamps during the historical journey.
setInterval(() => mock.timers.tick(50), 50).unref();
