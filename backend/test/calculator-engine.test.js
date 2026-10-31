"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate, format } = require("../../calculator-engine.js");

test("uses standard operator precedence", () => {
  assert.equal(evaluate("2+3*4"), 14);
  assert.equal(evaluate("(2+3)*4"), 20);
});
test("handles decimals and negative values", () => {
  assert.equal(format(evaluate("0.1+0.2")), "0.3");
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

test("supports scientific trigonometry in degree and radian modes", () => {
  assert.ok(Math.abs(evaluate("sin(30)", { angleMode: "DEG" }) - 0.5) < 1e-12);
  assert.ok(Math.abs(evaluate("cos(60)", { angleMode: "DEG" }) - 0.5) < 1e-12);
  assert.ok(Math.abs(evaluate("sin(pi/6)", { angleMode: "RAD" }) - 0.5) < 1e-12);
  assert.ok(Math.abs(evaluate("asin(0.5)", { angleMode: "DEG" }) - 30) < 1e-12);
});
test("supports roots, powers, logarithms, constants and factorials", () => {
  assert.equal(evaluate("sqrt(81)"), 9);
  assert.equal(evaluate("cbrt(27)"), 3);
  assert.equal(evaluate("2^3^2"), 512);
  assert.equal(evaluate("5!"), 120);
  assert.equal(evaluate("log10(1000)"), 3);
  assert.equal(evaluate("ln(e)"), 1);
  assert.ok(Math.abs(evaluate("2pi") - 2 * Math.PI) < 1e-12);
  assert.equal(evaluate("2(3+4)"), 14);
});
test("rejects invalid scientific domains and factorial values", () => {
  assert.throws(() => evaluate("sqrt(-1)"), /supported range/i);
  assert.throws(() => evaluate("ln(0)"), /supported range/i);
  assert.throws(() => evaluate("3.5!"), /whole number/i);
});
