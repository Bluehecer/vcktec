import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { deleteObject, ref } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { subscribeToAccess } from "./auth.js";
import { auth, db, isFirebaseConfigured, storage } from "./firebase.js";
import { uploadCloudinaryImage } from "./cloudinary.js";

const managerRoles = ["owner", "president", "editor"];
const form = document.querySelector("#announcement-form");
const preview = document.querySelector("#announcement-image-preview");
const saveStatus = document.querySelector("#announcement-save-status");
const itemLabel = document.querySelector("#destination-item-label");
const destinationSelect = form.elements.destinationId;
const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
let currentUser = null;
let currentProfile = null;
let previewUrl = null;

function setMessage(text, isError = false) {
  const target = document.querySelector("#announcement-message");
  target.textContent = text;
  target.classList.toggle("is-error", isError);
  if (text) window.vcktecToast?.(text, isError ? "error" : "success");
}

function setSaveStatus(text, isError = false) {
  saveStatus.textContent = text;
  saveStatus.classList.toggle("is-error", isError);
  saveStatus.hidden = !text;
}

function showGate(title, copy, login = false) {
  document.querySelector("#announcement-gate").hidden = false;
  document.querySelector("#announcement-content").hidden = true;
  document.querySelector("#announcement-gate-title").textContent = title;
  document.querySelector("#announcement-gate-copy").textContent = copy;
  document.querySelector("#announcement-gate-link").hidden = !login;
  window.dispatchEvent(new Event("vcktec:page-ready"));
}

function dateToInput(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function timestampFromInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Check the announcement start and end times.");
  return date;
}

async function populateDestinationItems(type, selectedId = "") {
  itemLabel.hidden = !["event", "album", "weeklyPost"].includes(type);
  destinationSelect.disabled = itemLabel.hidden;
  destinationSelect.replaceChildren(new Option("Loading content…", ""));
  if (itemLabel.hidden) return;
  const collectionName = type === "event" ? "events" : type === "album" ? "gallery" : "weeklyPosts";
  const snapshot = await getDocs(collection(db, collectionName));
  const options = [];
  if (type === "event") {
    snapshot.docs.forEach((entry) => options.push({ id: entry.id, label: entry.data().title || "Untitled event" }));
  } else if (type === "weeklyPost") {
    snapshot.docs.forEach((entry) => options.push({ id: entry.id, label: entry.data().title || "Untitled Weekly post" }));
  } else {
    const albums = new Set();
    snapshot.docs.forEach((entry) => {
      const album = entry.data().album;
      if (typeof album === "string" && album.trim()) albums.add(album.trim());
    });
    [...albums].sort((first, second) => first.localeCompare(second)).forEach((album) => options.push({ id: album, label: album }));
  }
  destinationSelect.replaceChildren(new Option(options.length ? "Choose content" : "No content available", ""));
  options.forEach(({ id, label }) => {
    const option = new Option(label, id);
    option.selected = id === selectedId;
    destinationSelect.append(option);
  });
  destinationSelect.disabled = options.length === 0;
  destinationSelect.required = options.length > 0;
}

function resetForm() {
  form.reset();
  form.elements.announcementId.value = "";
  form.elements.previousImagePath.value = "";
  delete form.dataset.currentImageUrl;
  form.elements.active.checked = true;
  form.elements.destinationId.required = false;
  document.querySelector("#announcement-form-heading").textContent = "Create announcement.";
  form.querySelector('button[type="submit"]').textContent = "Publish announcement";
  document.querySelector("#cancel-announcement-edit").hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.replaceChildren();
  preview.hidden = true;
  populateDestinationItems("none");
}

function setBusy(busy) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  if (busy) {
    const spinner = document.createElement("span");
    spinner.className = "button-spinner";
    spinner.setAttribute("aria-hidden", "true");
    button.append(spinner);
  } else button.querySelector(".button-spinner")?.remove();
}

form.elements.image.addEventListener("change", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  preview.replaceChildren();
  const file = form.elements.image.files?.[0];
  preview.hidden = !file;
  if (!file) return;
  const image = document.createElement("img");
  previewUrl = URL.createObjectURL(file);
  image.src = previewUrl;
  image.alt = "Announcement image preview";
  preview.append(image);
});

form.elements.destinationType.addEventListener("change", async () => {
  try {
    await populateDestinationItems(form.elements.destinationType.value);
  } catch (error) {
    console.error("Could not load announcement destinations:", error);
    setMessage(error.message || "The destination list could not be loaded.", true);
  }
});

document.querySelector("#cancel-announcement-edit").addEventListener("click", resetForm);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (form.dataset.saving === "true") return;
  const data = new FormData(form);
  const type = String(data.get("destinationType") || "none");
  const destinationId = String(data.get("destinationId") || "");
  const selectedOption = destinationSelect.selectedOptions[0];
  if (["event", "album", "weeklyPost"].includes(type) && !destinationId) {
    setMessage("Choose the event, album, or Weekly post for the announcement button.", true);
    return;
  }
  const file = form.elements.image.files?.[0];
  if (file && (!imageTypes.includes(file.type) || file.size > 8 * 1024 * 1024)) {
    setMessage("Choose a JPG, PNG, WebP, or GIF image smaller than 8 MB.", true);
    return;
  }
  const startsAt = timestampFromInput(String(data.get("startsAt") || ""));
  const expiresAt = timestampFromInput(String(data.get("expiresAt") || ""));
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    setMessage("The end time must be after the start time.", true);
    return;
  }
  form.dataset.saving = "true";
  setBusy(true);
  setSaveStatus("Preparing announcement…");
  let uploadedPublicId = "";
  let saved = false;
  let cleanupFailed = false;
  let firestoreWaitTimer = null;
  try {
    const id = String(data.get("announcementId") || "");
    const oldImageStoragePath = String(data.get("previousImagePath") || "");
    const oldImagePublicId = oldImageStoragePath.startsWith("cloudinary:")
      ? oldImageStoragePath.slice("cloudinary:".length)
      : "";
    const oldImagePath = oldImagePublicId ? "" : oldImageStoragePath;
    let imageUrl = String(form.dataset.currentImageUrl || "");
    if (file) {
      setSaveStatus("Uploading announcement image to Cloudinary… 0%");
      const upload = await uploadCloudinaryImage(file, (percent) => {
        setSaveStatus(`Uploading announcement image to Cloudinary… ${percent}%`);
      });
      imageUrl = upload.url;
      uploadedPublicId = upload.publicId;
    }
    const destinationLabel = ["event", "album", "weeklyPost"].includes(type)
      ? selectedOption?.textContent || ""
      : "";
    const payload = {
      title: String(data.get("title") || "").trim(),
      message: String(data.get("message") || "").trim(),
      imageUrl,
      imageStoragePath: file
        ? (uploadedPublicId ? `cloudinary:${uploadedPublicId}` : "")
        : oldImageStoragePath,
      destinationType: type,
      destinationId: ["event", "album", "weeklyPost"].includes(type) ? destinationId : "",
      destinationLabel,
      linkText: String(data.get("linkText") || "").trim().slice(0, 45),
      startsAt,
      expiresAt,
      active: form.elements.active.checked,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid,
      updatedByName: String(currentProfile.name || currentUser.displayName || currentUser.email || "VCKTEC manager").slice(0, 100)
    };
    setSaveStatus("Saving announcement details to Firebase…");
    firestoreWaitTimer = window.setTimeout(() => {
      setSaveStatus("Firebase is still processing the save. Keep this page open while it finishes.");
    }, 12000);
    if (id) {
      await updateDoc(doc(db, "announcements", id), payload);
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = currentUser.uid;
      await addDoc(collection(db, "announcements"), payload);
    }
    window.clearTimeout(firestoreWaitTimer);
    firestoreWaitTimer = null;
    saved = true;
    if (file && oldImagePath) {
      try { await deleteObject(ref(storage, oldImagePath)); }
      catch (error) {
        cleanupFailed = true;
        console.error("Announcement saved, but the replaced image could not be removed:", error);
      }
    }
    const successMessage = id ? "Announcement updated." : "Announcement published.";
    setMessage(cleanupFailed
      ? "Announcement saved, but the previous image could not be cleaned up. Ask an administrator to check Firebase Storage."
      : (uploadedPublicId && oldImagePublicId
        ? `${successMessage} The previous Cloudinary image remains in the media library.`
        : successMessage), cleanupFailed);
    setSaveStatus(id ? "Announcement updated." : "Announcement published.");
    resetForm();
    setSaveStatus("Refreshing the announcement list…");
    try {
      await loadAnnouncements();
      setSaveStatus(id ? "Done. Announcement updated." : "Done. Announcement published.");
    } catch (error) {
      console.error("Announcement saved, but its list could not be refreshed:", error);
      setMessage("Announcement saved, but the list could not refresh. Reload this page to see it.", true);
      setSaveStatus("Saved successfully, but the list could not refresh. Reload this page.", true);
    }
  } catch (error) {
    window.clearTimeout(firestoreWaitTimer);
    console.error("Could not save the VCKTEC announcement:", error);
    const message = saved
      ? `Announcement saved, but the page could not refresh: ${error.message || "refresh failed"}. Reload the page.`
      : (uploadedPublicId
        ? `Image uploaded, but the announcement could not be saved. Cloudinary asset ${uploadedPublicId} may need manual cleanup. ${error.message || ""}`.trim()
        : (error.message || "The announcement could not be saved."));
    setMessage(message, true);
    setSaveStatus(message, true);
  } finally {
    form.dataset.saving = "false";
    setBusy(false);
    window.dispatchEvent(new Event("vcktec:page-ready"));
  }
});

function editAnnouncement(id, data) {
  form.reset();
  form.elements.announcementId.value = id;
  form.elements.previousImagePath.value = data.imageStoragePath || "";
  form.elements.title.value = data.title || "";
  form.elements.message.value = data.message || "";
  form.elements.linkText.value = data.linkText || "";
  form.elements.startsAt.value = dateToInput(data.startsAt);
  form.elements.expiresAt.value = dateToInput(data.expiresAt);
  form.elements.active.checked = data.active === true;
  form.dataset.currentImageUrl = data.imageUrl || "";
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  preview.replaceChildren();
  preview.hidden = !data.imageUrl;
  if (data.imageUrl) {
    const image = document.createElement("img");
    image.src = data.imageUrl;
    image.alt = "Current announcement image";
    preview.append(image);
  }
  const type = data.destinationType || "none";
  form.elements.destinationType.value = type;
  void populateDestinationItems(type, data.destinationId || "").catch((error) => {
    console.error("Could not load the saved announcement destination:", error);
    setMessage("The saved destination could not be loaded.", true);
  });
  document.querySelector("#announcement-form-heading").textContent = "Edit announcement.";
  form.querySelector('button[type="submit"]').textContent = "Save announcement";
  document.querySelector("#cancel-announcement-edit").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function makeAnnouncementItem(id, data) {
  const article = document.createElement("article");
  article.className = "managed-item announcement-managed-item";
  if (data.imageUrl) {
    const image = document.createElement("img");
    image.className = "managed-thumbnail";
    image.src = data.imageUrl;
    image.alt = "";
    article.append(image);
  }
  const content = document.createElement("div");
  content.className = "managed-item-copy";
  const title = document.createElement("strong");
  title.textContent = data.title || "Announcement";
  const detail = document.createElement("small");
  const state = data.active ? "Active" : "Paused";
  const author = data.updatedByName || data.createdByName || "VCKTEC";
  detail.textContent = `${state} · Updated by ${author}`;
  const message = document.createElement("p");
  message.textContent = data.message || "";
  content.append(title, detail, message);
  const actions = document.createElement("div");
  actions.className = "managed-actions";
  const edit = document.createElement("button");
  edit.className = "mini-button";
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => editAnnouncement(id, data));
  const toggle = document.createElement("button");
  toggle.className = "mini-button";
  toggle.type = "button";
  toggle.textContent = data.active ? "Pause" : "Activate";
  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    let updated = false;
    try {
      await updateDoc(doc(db, "announcements", id), {
        active: !data.active,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
        updatedByName: String(currentProfile.name || currentUser.displayName || currentUser.email || "VCKTEC manager").slice(0, 100)
      });
      updated = true;
      setMessage(data.active ? "Announcement paused." : "Announcement activated.");
      await loadAnnouncements();
    } catch (error) {
      console.error("Could not change announcement status:", error);
      setMessage(updated
        ? `Announcement status changed, but the list could not refresh: ${error.message || "refresh failed"}. Reload the page.`
        : (error.message || "The announcement status could not be changed."), true);
      toggle.disabled = false;
    }
  });
  const remove = document.createElement("button");
  remove.className = "mini-button danger";
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Delete “${data.title || "this announcement"}”?`)) return;
    let deleted = false;
    try {
      await deleteDoc(doc(db, "announcements", id));
      deleted = true;
      let cleanupFailed = false;
      const cloudinaryImage = typeof data.imageStoragePath === "string"
        && data.imageStoragePath.startsWith("cloudinary:");
      if (data.imageStoragePath && !cloudinaryImage) {
        try { await deleteObject(ref(storage, data.imageStoragePath)); }
        catch (error) {
          cleanupFailed = true;
          console.error("Announcement deleted, but its image could not be removed:", error);
        }
      }
      setMessage(cleanupFailed
        ? "Announcement deleted, but its image could not be cleaned up. Ask an administrator to check Firebase Storage."
        : (cloudinaryImage
          ? "Announcement deleted. Its Cloudinary image remains in the media library."
          : "Announcement deleted."), cleanupFailed);
      await loadAnnouncements();
    } catch (error) {
      console.error("Could not delete the VCKTEC announcement:", error);
      setMessage(deleted
        ? `Announcement deleted, but the list could not refresh: ${error.message || "refresh failed"}. Reload the page.`
        : (error.message || "The announcement could not be deleted."), true);
    }
  });
  actions.append(edit, toggle, remove);
  article.append(content, actions);
  return article;
}

async function loadAnnouncements() {
  const container = document.querySelector("#managed-announcements");
  container.replaceChildren();
  const snapshot = await getDocs(query(collection(db, "announcements"), orderBy("updatedAt", "desc")));
  if (snapshot.empty) {
    const note = document.createElement("p");
    note.className = "form-note";
    note.textContent = "No announcements have been created.";
    container.append(note);
    return;
  }
  snapshot.docs.forEach((entry) => container.append(makeAnnouncementItem(entry.id, entry.data())));
}

function showPage(access) {
  if (!access.configured) return showGate("Firebase setup needed.", "Configure Firebase before managing announcements.");
  if (!access.user) return showGate("Sign in to continue.", "Only approved owners, presidents, and editors can manage announcements.", true);
  if (access.error) return showGate("Could not verify your access.", "Refresh the page or check your connection.", true);
  if (!managerRoles.includes(access.profile?.role) || access.profile.approved !== true) {
    return showGate("Announcement access is restricted.", "Only an approved owner, president, or editor can use this page.", true);
  }
  currentUser = access.user;
  currentProfile = access.profile;
  document.querySelector("#announcement-gate").hidden = true;
  document.querySelector("#announcement-content").hidden = false;
  void loadAnnouncements().catch((error) => {
    console.error("Could not load VCKTEC announcements:", error);
    setMessage(error.message || "The announcements could not be loaded.", true);
  }).finally(() => window.dispatchEvent(new Event("vcktec:page-ready")));
}

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.assign("login.html");
  } catch (error) {
    console.error("Could not sign out from VCKTEC announcements:", error);
    setMessage("Sign out failed. Please try again.", true);
  }
});

if (!isFirebaseConfigured) showGate("Firebase setup needed.", "Configure Firebase before managing announcements.");
else subscribeToAccess(showPage);
