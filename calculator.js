(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = { expression: "", justCalculated: false, lastResult: 0, history: [] };
  const operators = ["+", "-", "*", "/"];
  const displayExpression = value => value.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");

  function render() {
    $("expression").textContent = state.expression ? displayExpression(state.expression) : "Ready to calculate";
    if (state.justCalculated) {
      $("display").textContent = state.lastResult;
    } else {
      const currentEntry = state.expression.match(/(-?(?:\d+\.?\d*|\.\d+)%?)$/);
      $("display").textContent = currentEntry ? currentEntry[1] : "0";
    }
  }
  function clearError() { $("calc-error").hidden = true; $("calc-error").textContent = ""; }
  function error(message) {
    $("calc-error").textContent = message || "Check the expression and try again.";
    $("calc-error").hidden = false;
    $("display").textContent = "—";
  }
  function appendDigit(digit) {
    clearError();
    if (state.justCalculated) { state.expression = ""; state.justCalculated = false; }
    const match = state.expression.match(/(?:^|[+\-*/(])(-?\d*\.?\d*)$/);
    const current = match ? match[1] : "";
    if (digit === "." && current.includes(".")) return;
    if (digit === "." && (!current || current === "-")) state.expression += "0";
    state.expression += digit;
    render();
  }
  function appendOperator(op) {
    clearError();
    if (state.justCalculated) { state.expression = String(state.lastResult); state.justCalculated = false; }
    if (!state.expression) {
      if (op === "-") state.expression = "-";
      else return;
    } else if (operators.includes(state.expression.slice(-1))) {
      if (op === "-" && state.expression.slice(-1) !== "-") state.expression += op;
      else state.expression = state.expression.slice(0, -1) + op;
    } else if (state.expression.endsWith("(")) {
      if (op === "-") state.expression += op;
      else return;
    } else state.expression += op;
    render();
  }
  function appendParen(paren) {
    clearError();
    if (state.justCalculated) { state.expression = ""; state.justCalculated = false; }
    if (paren === "(" && /[\d.)%]$/.test(state.expression)) state.expression += "*";
    state.expression += paren;
    render();
  }
  function toggleSign() {
    clearError();
    if (state.justCalculated) { state.expression = String(-state.lastResult); state.justCalculated = false; render(); return; }
    const match = state.expression.match(/(\d*\.?\d+(?:e[+-]?\d+)?)$/i);
    if (!match) {
      if (!state.expression || /[+\-*/(]$/.test(state.expression)) state.expression += "-";
      render(); return;
    }
    const start = match.index;
    const prefix = state.expression.slice(0, start);
    const negative = prefix.endsWith("-") && (prefix.length === 1 || /[+*/(]$/.test(prefix.slice(0, -1)));
    state.expression = negative ? prefix.slice(0, -1) + match[1] : prefix + "-" + match[1];
    render();
  }
  function addHistory(expression, result) {
    state.history.unshift({ expression: displayExpression(expression), result });
    state.history = state.history.slice(0, 8);
    renderHistory();
  }
  function calculate() {
    clearError();
    if (!state.expression.trim()) { error("Enter a calculation first."); return; }
    try {
      const result = CalculatorEngine.evaluate(state.expression);
      const formatted = CalculatorEngine.format(result);
      addHistory(state.expression, formatted);
      state.lastResult = formatted;
      state.expression = formatted;
      state.justCalculated = true;
      $("display").textContent = formatted;
      $("expression").textContent = displayExpression(state.expression) + " =";
      clearError();
    } catch (e) {
      error(e instanceof Error ? e.message : "That calculation could not be completed.");
    }
  }
  function backspace() {
    clearError();
    if (state.justCalculated) { state.expression = ""; state.justCalculated = false; }
    else state.expression = state.expression.slice(0, -1);
    render();
  }
  function percent() {
    clearError();
    if (state.justCalculated) { state.expression = String(Number(state.lastResult) / 100); state.lastResult = state.expression; state.justCalculated = true; render(); return; }
    if (!state.expression || operators.includes(state.expression.slice(-1))) return;
    state.expression += "%";
    render();
  }
  function renderHistory() {
    const host = $("history");
    host.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "Your calculations will appear here.";
      host.append(empty);
      return;
    }
    state.history.forEach(item => {
      const row = document.createElement("div");
      row.className = "history-item";
      const expression = document.createElement("span");
      expression.textContent = item.expression;
      const result = document.createElement("strong");
      result.textContent = item.result;
      row.append(expression, result);
      host.append(row);
    });
  }
  function percentage() {
    const score = $("score").value;
    const total = $("total").value;
    if (score === "" || total === "" || !Number.isFinite(Number(score)) || !Number.isFinite(Number(total)) || Number(total) <= 0 || Number(score) < 0) {
      $("score-percent").textContent = "—";
      return;
    }
    const value = Number(score) / Number(total) * 100;
    $("score-percent").textContent = Number.isFinite(value) ? CalculatorEngine.format(value) + "%" : "—";
  }
  $("keys").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.digit !== undefined) appendDigit(button.dataset.digit);
    else if (button.dataset.op) appendOperator(button.dataset.op);
    else {
      switch (button.dataset.action) {
        case "clear": state.expression = ""; state.justCalculated = false; clearError(); render(); break;
        case "backspace": backspace(); break;
        case "decimal": appendDigit("."); break;
        case "equals": calculate(); break;
        case "percent": percent(); break;
        case "sign": toggleSign(); break;
        case "left-paren": appendParen("("); break;
        case "right-paren": appendParen(")"); break;
      }
    }
  });
  document.addEventListener("keydown", event => {
    if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (/^\d$/.test(event.key)) { appendDigit(event.key); return; }
    if (event.key === ".") { appendDigit("."); return; }
    if (operators.includes(event.key)) { event.preventDefault(); appendOperator(event.key); return; }
    if (event.key === "%") { percent(); return; }
    if (event.key === "(" || event.key === ")") { appendParen(event.key); return; }
    if (event.key === "Enter" || event.key === "=") { event.preventDefault(); calculate(); return; }
    if (event.key === "Escape") { state.expression = ""; state.justCalculated = false; clearError(); render(); return; }
    if (event.key === "Backspace") { event.preventDefault(); backspace(); }
  });
  $("score").addEventListener("input", percentage);
  $("total").addEventListener("input", percentage);
  $("clear-history").addEventListener("click", () => { state.history = []; renderHistory(); });
  $("year-label").textContent = new Date().getFullYear();
  render(); renderHistory();
})();
