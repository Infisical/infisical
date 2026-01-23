"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zodBuffer = void 0;
const zod_1 = require("zod");
exports.zodBuffer = zod_1.z.custom((data) => Buffer.isBuffer(data) || data instanceof Uint8Array, {
    message: "Expected binary data (Buffer Or Uint8Array)"
});
//# sourceMappingURL=zod.js.map