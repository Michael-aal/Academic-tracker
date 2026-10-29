(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const form = document.getElementById("institution-form");
  const message = document.getElementById("institution-message");
  const button = document.getElementById("institution-submit");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    message.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries());
    data.seatCount = Number(data.seatCount);
    button.disabled = true; button.textContent = "Sending inquiry…";
    try {
      const response = await fetch(API + "/api/institutions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send the inquiry.");
      message.textContent = result.message || "Inquiry received.";
      message.hidden = false;
      form.reset();
    } catch (error) {
      message.textContent = error instanceof TypeError ? "Could not reach the API. Check your connection and try again." : error.message;
      message.hidden = false;
      message.style.borderColor = "var(--money-danger)";
    } finally { button.disabled = false; button.textContent = "Send inquiry"; }
  });
})();