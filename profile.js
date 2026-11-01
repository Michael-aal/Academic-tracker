(() => {
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  const $ = (id) => document.getElementById(id);
  if (!token) { window.location.replace("login.html"); return; }
  const form = $("profile-form");
  const saveButton = $("save-profile");
  const errorBox = $("profile-error");
  const successBox = $("profile-success");
  let currentUser = null;

  function handleFor(email) {
    const prefix = String(email || "").split("@")[0].toLowerCase();
    const clean = prefix.replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "");
    return "@" + (clean || "student");
  }
  function initials(name) {
    return String(name || "A").trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "A";
  }
  function message(box, text, success = false) {
    errorBox.classList.remove("show");
    successBox.classList.remove("show");
    box.textContent = text;
    box.classList.add("show");
    if (success) box.classList.add("success");
    else box.classList.remove("success");
  }
  function paint(user) {
    currentUser = user;
    const name = user.name || "Student";
    const handle = handleFor(user.email);
    $("profile-avatar").textContent = initials(name);
    $("profile-heading").textContent = name;
    $("profile-handle").textContent = handle;
    $("profile-email").textContent = user.email || "";
    $("profile-name").value = name;
    $("profile-email-input").value = user.email || "";
    $("profile-role").textContent = user.isAdmin ? "Administrator" : "Student";
    $("profile-created").textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"}) : "—";
    $("profile-handle-small").textContent = handle;
    localStorage.setItem("academic-tracker-user", JSON.stringify(user));
  }
  async function loadProfile() {
    try {
      const response = await fetch(API_BASE + "/api/auth/me", {headers:{Authorization:"Bearer " + token}});
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { localStorage.removeItem("academic-tracker-token"); localStorage.removeItem("academic-tracker-user"); window.location.replace("login.html"); return; }
      if (!response.ok || !data.user) throw new Error(data.error || "Could not load your profile. Please try again.");
      paint(data.user);
    } catch (error) {
      message(errorBox, error instanceof TypeError ? "Could not connect to your account right now. Check your connection and try again." : error.message);
    }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    const name = $("profile-name").value.trim();
    if (name.length < 2) return message(errorBox, "Your display name must contain at least 2 characters.");
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      const response = await fetch(API_BASE + "/api/auth/me", {
        method:"PATCH",
        headers:{"Content-Type":"application/json",Authorization:"Bearer " + token},
        body:JSON.stringify({name})
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { localStorage.removeItem("academic-tracker-token"); localStorage.removeItem("academic-tracker-user"); window.location.replace("login.html"); return; }
      if (!response.ok || !data.user) throw new Error(data.error || "Your profile could not be saved.");
      paint(data.user);
      message(successBox, "Your display name has been updated.", true);
    } catch (error) {
      message(errorBox, error instanceof TypeError ? "Could not connect to the API. Your changes have not been saved." : error.message);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save changes";
    }
  });
  $("profile-signout").addEventListener("click", () => {
    localStorage.removeItem("academic-tracker-token");
    localStorage.removeItem("academic-tracker-user");
    window.location.replace("index.html");
  });

  const deleteDialog = $("delete-account-dialog");
  const deleteForm = $("delete-account-form");
  const deleteSubmit = $("confirm-delete-account");
  const deleteError = $("delete-account-error");

  function clearLocalAccountData() {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("academic-tracker-") && key !== "academic-tracker-theme") {
        localStorage.removeItem(key);
      }
    }
    sessionStorage.clear();
  }

  function closeDeleteDialog() {
    deleteDialog.close();
    deleteForm.reset();
    deleteError.textContent = "";
    deleteError.classList.remove("show");
  }

  $("open-delete-account").addEventListener("click", () => {
    deleteDialog.showModal();
    $("delete-account-password").focus();
  });
  $("close-delete-account").addEventListener("click", closeDeleteDialog);
  $("cancel-delete-account").addEventListener("click", closeDeleteDialog);
  deleteDialog.addEventListener("click", event => {
    if (event.target === deleteDialog) closeDeleteDialog();
  });

  deleteForm.addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("delete-account-password").value;
    const confirmation = $("delete-account-confirmation").value.trim();
    if (!password) {
      deleteError.textContent = "Enter your current password.";
      deleteError.classList.add("show");
      return;
    }
    if (confirmation !== "DELETE") {
      deleteError.textContent = "Type DELETE exactly to confirm.";
      deleteError.classList.add("show");
      return;
    }

    deleteSubmit.disabled = true;
    deleteSubmit.textContent = "Deleting account…";
    deleteError.classList.remove("show");
    try {
      const response = await fetch(API_BASE + "/api/account/me", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ password, confirmation })
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && /session|log in|invalid/i.test(data.error || "")) {
        clearLocalAccountData();
        window.location.replace("login.html");
        return;
      }
      if (!response.ok || data.deleted !== true) {
        throw new Error(data.error || "Your account could not be deleted. Please try again.");
      }
      clearLocalAccountData();
      window.location.replace("index.html?account=deleted");
    } catch (error) {
      deleteError.textContent = error instanceof TypeError
        ? "Could not connect to the API. Your account has not been deleted."
        : error.message;
      deleteError.classList.add("show");
    } finally {
      deleteSubmit.disabled = false;
      deleteSubmit.textContent = "Permanently delete";
    }
  });
  loadProfile();
})();