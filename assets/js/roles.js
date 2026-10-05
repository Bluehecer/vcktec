import { collection, doc, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { subscribeToAccess } from "./auth.js";
import { auth, db, isFirebaseConfigured } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const allowedRoles = ["member", "editor", "president"];
let accessLoaded = false;

function message(text, isError = false) {
  const target = document.querySelector("#roles-message");
  target.textContent = text;
  target.classList.toggle("is-error", isError);
  if (text) window.vcktecToast?.(text, isError ? "error" : "success");
}

function showGate(title, copy, showLogin = false) {
  document.querySelector("#roles-content").hidden = true;
  document.querySelector("#roles-gate").hidden = false;
  document.querySelector("#roles-gate-title").textContent = title;
  document.querySelector("#roles-gate-copy").textContent = copy;
  document.querySelector("#roles-gate-link").hidden = !showLogin;
  window.dispatchEvent(new Event("vcktec:page-ready"));
}

function showRoleEditor(userId, profile, container) {
  const item = document.createElement("article");
  item.className = "managed-item role-member-item";
  const copy = document.createElement("div");
  copy.className = "managed-item-copy";
  const title = document.createElement("strong");
  title.textContent = profile.name || profile.email || "VCKTEC member";
  const detail = document.createElement("small");
  detail.textContent = `${profile.email || "No email"} · ${profile.approved === true ? profile.role : "Pending approval"}`;
  copy.append(title, detail);
  const actions = document.createElement("div");
  actions.className = "managed-actions role-actions";
  const select = document.createElement("select");
  select.className = "role-select";
  select.setAttribute("aria-label", `Role for ${profile.name || profile.email || "member"}`);
  allowedRoles.forEach((role) => {
    const option = new Option(role[0].toUpperCase() + role.slice(1), role);
    option.selected = profile.approved === true ? profile.role === role : role === "member";
    select.append(option);
  });
  const save = document.createElement("button");
  save.type = "button";
  save.className = "mini-button";
  save.textContent = profile.approved === true ? "Save role" : "Approve account";
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const role = select.value;
      await updateDoc(doc(db, "users", userId), { role, approved: true });
      message(`Approved ${profile.name || "member"} as ${role}.`);
      await loadUsers();
    } catch (error) {
      console.error("Could not update a VCKTEC user role:", error);
      message(error.message || "The role could not be updated.", true);
    } finally {
      save.disabled = false;
    }
  });
  actions.append(select, save);
  item.append(copy, actions);
  container.append(item);
}

async function loadUsers() {
  const pendingContainer = document.querySelector("#role-pending-members");
  const activeContainer = document.querySelector("#role-active-members");
  pendingContainer.replaceChildren();
  activeContainer.replaceChildren();
  const snapshot = await getDocs(collection(db, "users"));
  const pending = [];
  const active = [];
  snapshot.docs.forEach((userDoc) => {
    const user = userDoc.data();
    if (userDoc.id === auth.currentUser?.uid || user.role === "owner") return;
    if (user.approved !== true || user.role === "pending") pending.push({ id: userDoc.id, profile: user });
    else active.push({ id: userDoc.id, profile: user });
  });
  if (!pending.length) pendingContainer.append(emptyNote("No membership requests are waiting."));
  pending.forEach(({ id, profile }) => showRoleEditor(id, profile, pendingContainer));
  if (!active.length) activeContainer.append(emptyNote("No other approved members yet."));
  active.forEach(({ id, profile }) => showRoleEditor(id, profile, activeContainer));
}

function emptyNote(text) {
  const note = document.createElement("p");
  note.className = "form-note";
  note.textContent = text;
  return note;
}

async function showRoles(access) {
  if (!access.configured) return showGate("Firebase setup needed.", "Configure Firebase to manage member access.");
  if (!access.user) return showGate("Sign in to continue.", "Only approved owners and presidents can manage roles.", true);
  if (access.error) return showGate("Could not verify your access.", "Refresh the page or check your connection.", true);
  if (!["owner", "president"].includes(access.profile?.role) || access.profile.approved !== true) {
    return showGate("Role management is restricted.", "Only an approved owner or president can open this page.", true);
  }
  document.querySelector("#roles-gate").hidden = true;
  document.querySelector("#roles-content").hidden = false;
  try {
    await loadUsers();
  } catch (error) {
    console.error("Could not load VCKTEC role assignments:", error);
    message(error.message || "The team list could not be loaded.", true);
  } finally {
    window.dispatchEvent(new Event("vcktec:page-ready"));
  }
}

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.assign("login.html");
  } catch (error) {
    console.error("Could not sign out from VCKTEC role management:", error);
    message("Sign out failed. Please try again.", true);
  }
});

if (!isFirebaseConfigured) showGate("Firebase setup needed.", "Configure Firebase to manage member access.");
else {
  subscribeToAccess((access) => {
    if (accessLoaded && document.querySelector("#roles-content").hidden === false) return;
    accessLoaded = true;
    void showRoles(access);
  });
}
