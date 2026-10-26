"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate, format } = require("../../calculator-engine.js");

test("uses standard operator precedence", () => {
  assert.equal(evaluate("2+3*4"), 14);
  assert.equal(evaluate("(2+3)*4"), 20);
});
test("handles decimals and negative values", () => {
  assert.equal(evaluate("0.1+0.2"), 0.3);
  assert.equal(evaluate("-5+2"), -3);
  assert.equal(evaluate("-(2+3)*2"), -10);
});
test("handles powers and postfix percentages", () => {
  assert.equal(evaluate("2^3^2"), 512);
  assert.equal(evaluate("50%"), 0.5);
  assert.equal(evaluate("200*10%"), 20);
});
test("rejects division by zero and malformed expressions", () => {
  assert.throws(() => evaluate("1/0"), /divide by zero/i);
  assert.throws(() => evaluate("2+"), /finish the expression/i);
  assert.throws(() => evaluate("2+unknown"), /check the expression/i);
  assert.throws(() => evaluate("1e999"), /too large/i);
});
test("format never returns NaN or Infinity", () => {
  assert.equal(format(-0), "0");
  assert.throws(() => format(Infinity), /supported range/i);
});
