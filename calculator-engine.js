"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CalculatorEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function tokenize(source) {
    const input = String(source).replace(/[×]/g, "*").replace(/[÷]/g, "/").replace(/[−]/g, "-").replace(/\s+/g, "");
    if (!input || input.length > 160) throw new Error("Enter a calculation first.");
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const rest = input.slice(i);
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
      if (number) {
        const value = Number(number[0]);
        if (!Number.isFinite(value)) throw new Error("That number is too large.");
        tokens.push({ type: "number", value });
        i += number[0].length;
        continue;
      }
      const ch = input[i];
      if ("+-*/^()%".includes(ch)) {
        tokens.push({ type: ch === "(" || ch === ")" ? ch : "operator", value: ch });
        i++;
        continue;
      }
      throw new Error("Check the expression and try again.");
    }
    return tokens;
  }

  function evaluate(source) {
    const tokens = tokenize(source);
    let position = 0;
    const peek = () => tokens[position];
    const take = () => tokens[position++];
    const finite = value => {
      if (!Number.isFinite(value)) throw new Error("This calculation is outside the supported range.");
      return Object.is(value, -0) ? 0 : value;
    };
    function primary() {
      const token = peek();
      if (!token) throw new Error("Finish the expression before calculating.");
      if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
        take();
        const value = primary();
        return token.value === "-" ? -value : value;
      }
      if (token.type === "number") {
        take();
        return token.value;
      }
      if (token.type === "(") {
        take();
        const value = sum();
        if (!peek() || take().type !== ")") throw new Error("Add the missing closing bracket.");
        return value;
      }
      throw new Error("Check the expression and try again.");
    }
    function postfix() {
      let value = primary();
      while (peek() && peek().type === "operator" && peek().value === "%") {
        take();
        value /= 100;
      }
      return value;
    }
    function power() {
      let value = postfix();
      if (peek() && peek().type === "operator" && peek().value === "^") {
        take();
        value = Math.pow(value, power());
      }
      return finite(value);
    }
    function product() {
      let value = power();
      while (peek() && peek().type === "operator" && ["*", "/"].includes(peek().value)) {
        const op = take().value;
        const right = power();
        if (op === "/" && right === 0) throw new Error("You can't divide by zero.");
        value = finite(op === "*" ? value * right : value / right);
      }
      return value;
    }
    function sum() {
      let value = product();
      while (peek() && peek().type === "operator" && ["+", "-"].includes(peek().value)) {
        const op = take().value;
        const right = product();
        value = finite(op === "+" ? value + right : value - right);
      }
      return value;
    }
    const result = sum();
    if (position !== tokens.length) throw new Error("Check the expression and try again.");
    return finite(result);
  }

  function format(value) {
    if (!Number.isFinite(value)) throw new Error("This calculation is outside the supported range.");
    if (Object.is(value, -0)) value = 0;
    return Number.parseFloat(value.toPrecision(11)).toString();
  }
  return { evaluate, format };
});
