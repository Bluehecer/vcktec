import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, isFirebaseConfigured } from "./firebase.js";

const seenKey = "vcktec-seen-announcements";
const allowedPages = new Set(["home", "events", "gallery", "weekly", "about", "board", "community"]);

function safeDestination(data) {
  const pages = {
    home: "index.html",
    events: "events.html",
    gallery: "gallery.html",
    weekly: "weekly.html",
    about: "about.html",
    board: "board.html",
    community: "community.html"
  };
  if (allowedPages.has(data.destinationType)) return pages[data.destinationType];
  if (!data.destinationId || !data.destinationLabel) return "";
  if (data.destinationType === "event") return `event.html?id=${encodeURIComponent(data.destinationId)}`;
  if (data.destinationType === "album") return `album.html?album=${encodeURIComponent(data.destinationLabel)}`;
  if (data.destinationType === "weeklyPost") return `weekly.html?postId=${encodeURIComponent(data.destinationId)}`;
  return "";
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function seenIds() {
  try {
    const values = JSON.parse(localStorage.getItem(seenKey) || "[]");
    return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []);
  } catch (error) {
    console.error("Could not read announcement display history:", error);
    return new Set();
  }
}

function markSeen(id) {
  const seen = seenIds();
  seen.add(id);
  try {
    localStorage.setItem(seenKey, JSON.stringify([...seen].slice(-100)));
  } catch (error) {
    console.error("Could not save announcement display history:", error);
  }
}

function announcementDate(value) {
  const date = value && typeof value.toDate === "function" ? value.toDate() : new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

async function loadActiveAnnouncements() {
  const snapshot = await getDocs(query(collection(db, "announcements"), where("active", "==", true)));
  const now = Date.now();
  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((item) => (!millis(item.startsAt) || millis(item.startsAt) <= now)
      && (!millis(item.expiresAt) || millis(item.expiresAt) > now))
    .sort((first, second) => millis(second.createdAt) - millis(first.createdAt));
}

function renderAnnouncementArchive(announcements) {
  const container = document.querySelector("#announcements-list");
  if (!container) return;
  container.replaceChildren();
  if (!announcements.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "There are no current announcements. Check back soon.";
    container.append(empty);
    return;
  }
  announcements.forEach((announcement) => {
    const card = document.createElement("article");
    card.className = "announcement-archive-card";
    if (announcement.imageUrl) {
      const image = document.createElement("img");
      image.className = "announcement-image";
      image.src = announcement.imageUrl;
      image.alt = announcement.title || "VCKTEC announcement";
      image.loading = "lazy";
      card.append(image);
    }
    const copy = document.createElement("div");
    copy.className = "announcement-copy";
    const kicker = document.createElement("p");
    kicker.className = "section-kicker";
    kicker.textContent = "VCKTEC ANNOUNCEMENT";
    const title = document.createElement("h2");
    title.textContent = announcement.title || "A message from VCKTEC";
    const date = announcementDate(announcement.createdAt);
    const posted = document.createElement("p");
    posted.className = "announcement-posted";
    posted.textContent = date ? `Posted ${date}` : "";
    const message = document.createElement("p");
    message.textContent = announcement.message || "";
    copy.append(kicker, title);
    if (date) copy.append(posted);
    copy.append(message);
    const target = safeDestination(announcement);
    if (target) {
      const link = document.createElement("a");
      link.className = "button button-primary announcement-link";
      link.href = target;
      link.textContent = announcement.linkText || "Explore more";
      copy.append(link);
    }
    card.append(copy);
    container.append(card);
  });
}

function createDialog(id, announcement) {
  const dialog = document.createElement("dialog");
  dialog.className = "announcement-dialog";
  dialog.setAttribute("aria-labelledby", "announcement-title");
  const panel = document.createElement("article");
  panel.className = "announcement-popover";
  const close = document.createElement("button");
  close.className = "announcement-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close announcement");
  close.textContent = "×";
  close.addEventListener("click", () => dialog.close());
  panel.append(close);
  if (announcement.imageUrl) {
    const image = document.createElement("img");
    image.className = "announcement-image";
    image.src = announcement.imageUrl;
    image.alt = announcement.title || "VCKTEC announcement";
    panel.append(image);
  }
  const copy = document.createElement("div");
  copy.className = "announcement-copy";
  const kicker = document.createElement("p");
  kicker.className = "section-kicker";
  kicker.textContent = "VCKTEC ANNOUNCEMENT";
  const title = document.createElement("h2");
  title.id = "announcement-title";
  title.textContent = announcement.title || "A message from VCKTEC";
  const message = document.createElement("p");
  message.textContent = announcement.message || "";
  copy.append(kicker, title, message);
  const target = safeDestination(announcement);
  if (target) {
    const link = document.createElement("a");
    link.className = "button button-primary announcement-link";
    link.href = target;
    link.textContent = announcement.linkText || "Explore more";
    copy.append(link);
  }
  panel.append(copy);
  dialog.append(panel);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    markSeen(id);
    dialog.remove();
  }, { once: true });
  return dialog;
}

async function showAnnouncement() {
  if (!isFirebaseConfigured || !db) return;
  const page = document.body.dataset.page;
  if (["login", "admin", "roles", "review", "announcement", "updates"].includes(page)) return;
  const seen = seenIds();
  const announcements = await loadActiveAnnouncements();
  if (!announcements.length || seen.has(announcements[0].id)) return;
  const announcement = announcements[0];
  const dialog = createDialog(announcement.id, announcement);
  document.body.append(dialog);
  dialog.showModal();
}

async function start() {
  try {
    if (document.body.dataset.page === "updates") {
      const container = document.querySelector("#announcements-list");
      if (!isFirebaseConfigured || !db) {
        container.textContent = "Connect Firebase to view VCKTEC announcements.";
        return;
      }
      renderAnnouncementArchive(await loadActiveAnnouncements());
      return;
    }
    await showAnnouncement();
  } catch (error) {
    console.error("Could not load VCKTEC announcements:", error);
    if (document.body.dataset.page === "updates") {
      const container = document.querySelector("#announcements-list");
      if (container) container.textContent = "Announcements could not be loaded. Please try again later.";
    } else window.vcktecToast?.("Announcements could not be loaded right now.", "error");
  } finally {
    window.dispatchEvent(new Event("vcktec:page-ready"));
  }
}

start();
