(() => {
  "use strict";
  const button = document.getElementById("account-export");
  const status = document.getElementById("account-export-status");
  if (!button || !status) return;
  const token = localStorage.getItem("academic-tracker-token") || "";
  const api = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  button.addEventListener("click", async () => {
    if (!token) { location.replace("login.html"); return; }
    button.disabled = true;
    status.textContent = "Preparing your private account export…";
    try {
      const response = await fetch(api + "/api/account/export", { headers: { Authorization: "Bearer " + token } });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        localStorage.removeItem("academic-tracker-token");
        localStorage.removeItem("academic-tracker-user");
        location.replace("login.html");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not export your account data.");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "academic-tracker-account-export-" + new Date().toISOString().slice(0, 10) + ".json";
      link.click();
      URL.revokeObjectURL(url);
      status.textContent = "Your account export is ready. Keep the file somewhere private.";
    } catch (error) {
      status.textContent = error.message || "Could not export your account data.";
    } finally { button.disabled = false; }
  });
})();
