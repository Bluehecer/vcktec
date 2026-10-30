import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, isFirebaseConfigured } from "./firebase.js?v=20261028-cloudinary-media1";
import "./announcements.js";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function empty(container, message) {
  if (!container) return;
  container.replaceChildren(element("p", "empty-state", message));
}

function formatDate(dateValue, options = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) {
  if (!dateValue) return "Date to be announced";
  const parsed = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? dateValue : new Intl.DateTimeFormat(undefined, options).format(parsed);
}

function eventHasEnded(event) {
  return (event.endDate || event.date || "") < today();
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function eventTags(parent, tags) {
  if (!Array.isArray(tags) || !tags.length) return;
  const row = element("div", "tag-row");
  tags.filter((tag) => typeof tag === "string" && tag.trim()).slice(0, 5)
    .forEach((tag) => row.append(element("span", "topic-tag", tag.trim())));
  if (row.childElementCount) parent.append(row);
}

function weeklyDateValue(value) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function weeklyMetadata(post) {
  const row = element("div", "weekly-post-meta");
  const updatedAt = weeklyDateValue(post.updatedAt);
  const publishedAt = weeklyDateValue(post.createdAt) || weeklyDateValue(post.publishedAt);
  const date = updatedAt || publishedAt;
  if (date) {
    const dateLabel = updatedAt ? "Updated" : "Published";
    row.append(element("span", "weekly-post-date", `◷ ${dateLabel} ${new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date)}`));
  }
  const author = updatedAt
    ? (post.updatedByName || post.authorName)
    : (post.authorName || post.createdByName);
  if (author) row.append(element("span", "weekly-post-author", `♙ ${author}`));
  if (updatedAt && post.authorName && post.updatedByName && post.updatedByName !== post.authorName) {
    row.append(element("span", "weekly-post-original-author", `Posted by ${post.authorName}`));
  }
  return row;
}

function eventCard(event) {
  const card = element("a", "event-card event-card-link");
  card.href = `event.html?id=${encodeURIComponent(event.id)}`;
  if (event.coverImageUrl) {
    const cover = element("img", "event-card-cover");
    cover.src = event.coverImageUrl;
    cover.alt = "";
    cover.loading = "lazy";
    card.append(cover);
  }
  const content = element("div", "event-card-content");
  const top = element("div", "event-card-top");
  top.append(element("span", "event-label", event.topic || "VCKTEC EVENT"));
  top.append(element("span", "event-date", formatDate(event.date, { month: "short", day: "numeric" })));
  const title = element("h3", "", event.title || "VCKTEC event");
  const description = element("p", "", event.description || "");
  const meta = element("div", "event-meta-line");
  meta.append(element("span", "", event.time || "Time to be announced"));
  if (event.venue) meta.append(element("span", "", `⌖ ${event.venue}`));
  content.append(top, title, description);
  eventTags(content, event.tags);
  content.append(meta);
  card.append(content);
  return card;
}

function mediaUrl(item) {
  return item.mediaUrl || item.imageUrl || item.videoUrl || "";
}

function isVideo(item) {
  return item.mediaType === "video" || Boolean(item.videoUrl);
}

function mediaCaption(item) {
  const caption = String(item.caption || "").trim();
  const isUploadFilename = /^(?:whatsapp(?:\s+(?:image|video))?|img[-_ ]?\d{4,}|vid[-_ ]?\d{4,}|pxl[_-]?\d+|dsc[_-]?\d+|image\s*\(\d+\)|video\s*\(\d+\))/i.test(caption);
  return isUploadFilename ? "" : caption;
}

let homepageSettings = { mediaUrl: "", mediaType: "", description: "", featuredAlbums: [] };
let homeGalleryTimer = null;

function renderHomepageMedia() {
  const container = document.querySelector("#home-featured-media");
  if (!container) return;
  const card = element("article", "home-feature-card");
  const url = safeUrl(homepageSettings.mediaUrl);
  let media = null;
  if (url && homepageSettings.mediaType === "video") {
    media = element("video", "home-feature-asset");
    media.src = url;
    media.controls = true;
    media.autoplay = true;
    media.loop = true;
    media.muted = true;
    media.playsInline = true;
    media.preload = "metadata";
    media.setAttribute("aria-label", "Featured VCKTEC video");
  } else if (url && homepageSettings.mediaType === "image") {
    media = element("img", "home-feature-asset");
    media.src = url;
    media.alt = "Featured VCKTEC project or activity";
    media.loading = "lazy";
  }
  if (media) {
    media.addEventListener("error", () => {
      media.replaceWith(element("div", "home-feature-placeholder", "Featured media is temporarily unavailable."));
    }, { once: true });
    card.append(media);
  } else {
    card.append(element("div", "home-feature-placeholder", "A featured VCKTEC image or video will appear here soon."));
  }
  const copy = element("div", "home-feature-copy");
  copy.append(element("p", "", homepageSettings.description || "A glimpse of the ideas, projects, and people bringing VCKTEC to life."));
  card.append(copy);
  container.replaceChildren(card);
}

async function loadHomepageSettings() {
  const snapshot = await getDoc(doc(db, "settings", "site_config"));
  const settings = snapshot.exists() ? snapshot.data() : {};
  homepageSettings = {
    mediaUrl: typeof settings.homeMediaUrl === "string" ? settings.homeMediaUrl : "",
    mediaType: ["image", "video"].includes(settings.homeMediaType) ? settings.homeMediaType : "",
    description: typeof settings.homeMediaDescription === "string" ? settings.homeMediaDescription : "",
    featuredAlbums: Array.isArray(settings.homeFeaturedAlbums)
      ? settings.homeFeaturedAlbums.filter((album) => typeof album === "string").slice(0, 4)
      : []
  };
  renderHomepageMedia();
}

function mediaElement(item, className = "") {
  const url = safeUrl(mediaUrl(item));
  if (!url) return null;
  const caption = mediaCaption(item);
  if (isVideo(item)) {
    const video = element("video", className);
    video.src = url;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("aria-label", caption || item.album || "VCKTEC event video");
    return video;
  }
  const image = element("img", className);
  image.src = url;
  image.alt = caption || item.album || "VCKTEC event photo";
  image.loading = "lazy";
  return image;
}

function mediaButton(item) {
  const captionText = mediaCaption(item);
  const button = element("button", "media-card");
  button.type = "button";
  button.setAttribute("aria-label", `Open ${isVideo(item) ? "video" : "photo"}${captionText ? `: ${captionText}` : ` from ${item.album || "VCKTEC"}`}`);
  const media = mediaElement(item, "media-card-asset");
  if (media) {
    if (media.tagName === "VIDEO") {
      media.removeAttribute("controls");
      media.muted = true;
      button.append(media);
      button.append(element("span", "video-play media-play", "▶"));
    } else button.append(media);
  }
  if (captionText) button.append(element("span", "media-card-caption", captionText));
  button.addEventListener("click", () => openViewer(item));
  return button;
}

function ensureViewer() {
  let dialog = document.querySelector("#media-dialog");
  if (dialog) return dialog;
  dialog = element("dialog", "media-dialog");
  dialog.id = "media-dialog";
  dialog.setAttribute("aria-label", "VCKTEC media viewer");
  const close = element("button", "dialog-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  const content = element("div", "dialog-content");
  content.id = "dialog-content";
  dialog.append(close, content);
  document.body.append(dialog);
  wireViewer(dialog);
  return dialog;
}

function wireViewer(dialog) {
  if (dialog.dataset.viewerReady === "true") return;
  dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.dataset.viewerReady = "true";
}

function openViewer(item) {
  const dialog = ensureViewer();
  wireViewer(dialog);
  const content = dialog.querySelector("#dialog-content");
  content.replaceChildren();
  const caption = mediaCaption(item);
  const media = mediaElement(item, "dialog-media");
  if (media) content.append(media);
  if (caption || item.album) {
    const copy = element("div", "dialog-copy");
    if (item.album) copy.append(element("p", "section-kicker", item.album));
    if (caption) copy.append(element("p", "", caption));
    content.append(copy);
  }
  dialog.showModal();
}

function renderWeeklyCard(post) {
  const card = element("article", "weekly-card");
  const cover = mediaElement({ mediaUrl: post.imageUrl, caption: post.title }, "weekly-card-image");
  if (cover) card.append(cover);
  const body = element("div", "weekly-card-body");
  body.append(element("p", "section-kicker", post.topic || "VCKTEC WEEKLY"));
  body.append(element("h2", "", post.title || "Technology, explored"));
  const metadata = weeklyMetadata(post);
  if (metadata.childElementCount) body.append(metadata);
  body.append(element("p", "weekly-excerpt", post.excerpt || post.description || ""));
  eventTags(body, post.tags);
  const actions = element("div", "weekly-card-actions");
  const readButton = element("button", "text-link", "Read the story →");
  readButton.type = "button";
  readButton.addEventListener("click", () => openWeeklyPost(post));
  actions.append(readButton);
  const sources = Array.isArray(post.sources) ? post.sources : [post.sourceUrl];
  sources.map(safeUrl).filter(Boolean).forEach((source, index) => {
    const link = element("a", "text-link", `Source${sources.length > 1 ? ` ${index + 1}` : ""} ↗`);
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    actions.append(link);
  });
  body.append(actions);
  card.append(body);
  return card;
}

function openWeeklyPost(post) {
  const dialog = ensureViewer();
  wireViewer(dialog);
  const content = dialog.querySelector("#dialog-content");
  content.replaceChildren();
  const image = mediaElement({ mediaUrl: post.imageUrl, caption: post.title }, "dialog-media");
  if (image) content.append(image);
  const copy = element("article", "dialog-copy weekly-dialog-copy");
  copy.append(element("p", "section-kicker", post.topic || "VCKTEC WEEKLY"));
  copy.append(element("h2", "", post.title || "Technology, explored"));
  const metadata = weeklyMetadata(post);
  if (metadata.childElementCount) copy.append(metadata);
  eventTags(copy, post.tags);
  copy.append(element("p", "weekly-full-description", post.description || post.excerpt || ""));
  const sources = Array.isArray(post.sources) ? post.sources : [post.sourceUrl];
  sources.map(safeUrl).filter(Boolean).forEach((source, index) => {
    const link = element("a", "button button-outline", `Explore source${sources.length > 1 ? ` ${index + 1}` : ""} ↗`);
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    copy.append(link);
  });
  content.append(copy);
  dialog.showModal();
}

function renderGalleryItems(items, container) {
  container.replaceChildren();
  if (!items.length) {
    empty(container, "No photos or videos have been added to this collection yet.");
    return;
  }
  items.forEach((item) => container.append(mediaButton(item)));
}

function renderHomeGallerySlideshow(container, slides) {
  container.replaceChildren();
  if (!slides.length) {
    empty(container, "Photos from the selected albums will appear here when they are available.");
    return;
  }

  const slideshow = element("div", "home-gallery-slideshow");
  const image = element("img", "home-gallery-image");
  const albumName = element("p", "home-gallery-album");
  image.loading = "eager";
  image.decoding = "async";
  image.alt = `Photo from ${slides[0].album}`;
  albumName.textContent = slides[0].album;
  let activeIndex = 0;

  function showSlide() {
    const slide = slides[activeIndex];
    image.src = slide.url;
    image.alt = `Photo from ${slide.album}`;
    albumName.textContent = slide.album;
  }

  image.addEventListener("error", () => {
    const unavailableSlide = slides[activeIndex];
    if (image.src !== unavailableSlide.url) return;
    slides.splice(activeIndex, 1);
    if (!slides.length) {
      if (homeGalleryTimer !== null) window.clearInterval(homeGalleryTimer);
      homeGalleryTimer = null;
      empty(container, "Photos from the selected albums are temporarily unavailable.");
      return;
    }
    activeIndex %= slides.length;
    if (slides.length < 2 && homeGalleryTimer !== null) {
      window.clearInterval(homeGalleryTimer);
      homeGalleryTimer = null;
    }
    showSlide();
  });

  function showNextSlide() {
    activeIndex = (activeIndex + 1) % slides.length;
    showSlide();
  }

  slideshow.append(image, albumName);
  container.append(slideshow);
  showSlide();
  if (slides.length > 1) homeGalleryTimer = window.setInterval(showNextSlide, 4500);
}

async function loadEvents() {
  const container = document.querySelector("#events-list");
  const home = document.querySelector("#home-events-preview");
  if (!container && !home) return;
  const snapshot = await getDocs(query(collection(db, "events"), orderBy("date", "asc")));
  const events = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  const upcoming = events.filter((item) => !eventHasEnded(item)).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  const past = events.filter((item) => item.date < today()).sort((a, b) => b.date.localeCompare(a.date));

  if (home) {
    home.replaceChildren();
    if (!upcoming.length) empty(home, "No upcoming events just yet. Check back soon for the next VCKTEC meetup.");
    else upcoming.slice(0, 3).forEach((item) => home.append(eventCard(item)));
  }
  if (container) {
    const filterButtons = [...document.querySelectorAll("[data-event-filter]")];
    let activeFilter = "upcoming";
    const paint = () => {
      const visible = activeFilter === "past" ? past : upcoming;
      container.replaceChildren();
      if (!visible.length) empty(container, activeFilter === "past" ? "Past event albums will appear here after the society adds them." : "No upcoming events just yet. Check back soon.");
      else visible.forEach((item) => container.append(eventCard(item)));
    };
    filterButtons.forEach((button) => button.addEventListener("click", () => {
      activeFilter = button.dataset.eventFilter;
      filterButtons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
      paint();
    }));
    paint();
  }
}

async function loadEventDetail() {
  const container = document.querySelector("#event-detail");
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    empty(container, "That event link is missing its event ID.");
    return;
  }
  const snapshot = await getDoc(doc(db, "events", id));
  if (!snapshot.exists()) {
    empty(container, "We couldn’t find that event. It may have been removed.");
    return;
  }
  const event = { id, ...snapshot.data() };
  document.title = `${event.title || "Event"} — VCKTEC`;
  container.replaceChildren();
  const back = element("a", "back-link", "← All events");
  back.href = "events.html";
  const hero = element("article", "event-detail");
  if (event.coverImageUrl) {
    const image = element("img", "event-detail-cover");
    image.src = event.coverImageUrl;
    image.alt = event.title ? `${event.title} event cover` : "VCKTEC event cover";
    hero.append(image);
  }
  const content = element("div", "event-detail-content");
  const isPast = eventHasEnded(event);
  content.append(element("p", "section-kicker", `${event.topic || "VCKTEC EVENT"} · ${isPast ? "COMPLETED" : "UPCOMING"}`));
  content.append(element("h1", "", event.title || "VCKTEC event"));
  eventTags(content, event.tags);
  const facts = element("div", "event-facts");
  facts.append(element("div", "", `◷  ${formatDate(event.date)}${event.time ? ` · ${event.time}` : ""}`));
  if (event.venue) facts.append(element("div", "", `⌖  ${event.venue}`));
  if (event.endDate) facts.append(element("div", "", `Through ${formatDate(event.endDate)}`));
  content.append(facts);
  content.append(element("div", "event-long-description", event.description || "More event details will be shared soon."));
  if (isPast) {
    const albumLink = element("a", "button button-primary", "Explore event photos & videos  →");
    albumLink.href = `gallery.html?eventId=${encodeURIComponent(id)}`;
    content.append(albumLink);
  }
  hero.append(content);
  container.append(back, hero);
}

function groupAlbums(items) {
  const grouped = new Map();
  items.forEach((item) => {
    const title = item.album || "VCKTEC moments";
    if (!grouped.has(title)) grouped.set(title, []);
    grouped.get(title).push(item);
  });
  return [...grouped.entries()].map(([title, media]) => ({ title, media }));
}

async function loadGallery() {
  const albumsContainer = document.querySelector("#albums-grid");
  const homeContainer = document.querySelector("#home-gallery-preview");
  const mediaContainer = document.querySelector("#album-media");
  const eventId = new URLSearchParams(location.search).get("eventId");
  if (!albumsContainer && !homeContainer && !mediaContainer) return;

  const mediaQuery = eventId
    ? query(collection(db, "gallery"), where("eventId", "==", eventId))
    : query(collection(db, "gallery"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(mediaQuery);
  const media = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).filter((item) => safeUrl(mediaUrl(item)));

  if (mediaContainer) {
    const heading = document.querySelector("#album-heading");
    if (eventId) {
      const eventSnapshot = await getDoc(doc(db, "events", eventId));
      const title = eventSnapshot.exists() ? eventSnapshot.data().title : "Event album";
      document.title = `${title} gallery — VCKTEC`;
      heading.replaceChildren(element("p", "section-kicker", "EVENT COLLECTION"), element("h1", "", title), element("p", "", "Every photo and video shared from this VCKTEC event."));
    } else {
      const albumName = new URLSearchParams(location.search).get("album");
      document.title = `${albumName || "Album"} — VCKTEC`;
      heading.replaceChildren(element("p", "section-kicker", "VCKTEC COLLECTION"), element("h1", "", albumName || "All moments"), element("p", "", "Photos and videos from VCKTEC."));
    }
    const selectedAlbum = new URLSearchParams(location.search).get("album");
    const selectedMedia = eventId ? media : (selectedAlbum ? media.filter((item) => item.album === selectedAlbum) : media);
    heading.querySelector("p:last-child").textContent = `${selectedMedia.length} ${selectedMedia.length === 1 ? "photo or video" : "photos and videos"} from this collection.`;
    renderGalleryItems(selectedMedia, mediaContainer);
    return;
  }

  const albums = groupAlbums(media);
  if (homeContainer) {
    const previews = homepageSettings.featuredAlbums
      .map((name) => albums.find((album) => album.title === name))
      .filter(Boolean);
    const slides = previews.flatMap((album) => album.media
      .filter((item) => !isVideo(item))
      .map((item) => ({ album: album.title, item, url: safeUrl(mediaUrl(item)) }))
      .filter((slide) => slide.url));
    renderHomeGallerySlideshow(homeContainer, slides);
  }
  if (albumsContainer) {
    albumsContainer.replaceChildren();
    if (eventId) {
      const heading = document.querySelector(".page-hero");
      heading.querySelector(".section-kicker").textContent = "EVENT COLLECTION";
      heading.querySelector("h1").textContent = "Event photos & videos";
      heading.querySelector("p:last-child").textContent = "All the moments shared from this event.";
      renderGalleryItems(media, albumsContainer);
    } else if (!albums.length) empty(albumsContainer, "The gallery is waiting for its first memories. Check back after the next VCKTEC event.");
    else albums.forEach((album) => albumsContainer.append(albumCard(album)));
  }
}

function albumCard(album, eventId = "") {
  const card = element("a", "album-card");
  const first = album.media[0];
  const preview = first ? mediaElement(first, "album-cover") : null;
  if (preview) {
    if (preview.tagName === "VIDEO") {
      preview.removeAttribute("controls");
      preview.muted = true;
      preview.className = "album-cover";
    }
    card.append(preview);
  }
  const overlay = element("div", "album-card-overlay");
  overlay.append(element("span", "section-kicker", `${album.media.length} ${album.media.length === 1 ? "MOMENT" : "MOMENTS"}`));
  overlay.append(element("h2", "", album.title));
  overlay.append(element("span", "album-open", "Open album →"));
  card.append(overlay);
  const href = eventId
    ? `album.html?eventId=${encodeURIComponent(eventId)}`
    : `album.html?album=${encodeURIComponent(album.title)}`;
  card.href = href;
  return card;
}

async function loadWeekly() {
  const full = document.querySelector("#weekly-grid");
  const home = document.querySelector("#home-weekly-preview");
  if (!full && !home) return;
  const snapshot = await getDocs(query(collection(db, "weeklyPosts"), orderBy("createdAt", "desc")));
  const posts = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  [[full, posts], [home, posts.slice(0, 2)]].forEach(([container, shown]) => {
    if (!container) return;
    container.replaceChildren();
    if (!shown.length) empty(container, "A fresh VCKTEC Weekly post is on the way. Check back soon.");
    else shown.forEach((post) => container.append(renderWeeklyCard(post)));
  });
  const requestedPostId = new URLSearchParams(location.search).get("postId");
  if (requestedPostId) {
    const requestedPost = posts.find((post) => post.id === requestedPostId);
    if (requestedPost) openWeeklyPost(requestedPost);
    else window.vcktecToast?.("That Weekly post could not be found.", "error");
  }
}

async function loadBoard() {
  const container = document.querySelector("#board-grid");
  if (!container) return;
  const snapshot = await getDocs(query(collection(db, "boardMembers"), orderBy("order", "asc")));
  const members = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  container.replaceChildren();
  if (!members.length) {
    empty(container, "The VCKTEC leadership profiles will be introduced here soon.");
    return;
  }
  members.forEach((member) => {
    const card = element("article", "board-card");
    const portrait = safeUrl(member.imageUrl);
    if (portrait) {
      const image = element("img", "board-portrait");
      image.src = portrait;
      image.alt = member.name ? `Portrait of ${member.name}` : "Society board member";
      image.loading = "lazy";
      card.append(image);
    } else card.append(element("div", "board-portrait board-placeholder", "V"));
    const details = element("div", "board-card-copy");
    details.append(element("span", "section-kicker", member.rank || "BOARD MEMBER"));
    details.append(element("h2", "", member.name || "VCKTEC member"));
    if (member.bio) details.append(element("p", "", member.bio));
    card.append(details);
    container.append(card);
  });
}

document.querySelectorAll(".nav-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const nav = document.querySelector(`#${toggle.getAttribute("aria-controls")}`);
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.setAttribute("aria-label", expanded ? "Open navigation" : "Close navigation");
    nav?.classList.toggle("is-open", !expanded);
  });
});

document.querySelectorAll(".nav-links a").forEach((link) => {
  link.addEventListener("click", () => {
    const nav = link.closest(".nav-links");
    nav?.classList.remove("is-open");
    document.querySelector(".nav-toggle")?.setAttribute("aria-expanded", "false");
  });
});

const year = document.querySelector("#current-year");
if (year) year.textContent = String(new Date().getFullYear());

async function start() {
  if (!isFirebaseConfigured || !db) {
    document.querySelectorAll("#home-events-preview, #events-list, #home-featured-media, #home-gallery-preview, #albums-grid, #album-media, #weekly-grid, #home-weekly-preview, #board-grid")
      .forEach((container) => empty(container, "Connect Firebase to load VCKTEC content."));
    const detail = document.querySelector("#event-detail");
    if (detail) empty(detail, "Connect Firebase to load this event.");
    return;
  }
  const page = document.body.dataset.page;
  try {
    if (page === "home" || page === "events") await loadEvents();
    if (page === "home") await loadHomepageSettings();
    if (page === "home" || page === "gallery" || page === "album") await loadGallery();
    if (page === "home" || page === "weekly") await loadWeekly();
    if (page === "board") await loadBoard();
    if (page === "event") await loadEventDetail();
  } catch (error) {
    console.error(`Could not load VCKTEC ${page} content:`, error);
    document.querySelectorAll("#home-events-preview, #events-list, #home-featured-media, #home-gallery-preview, #albums-grid, #album-media, #weekly-grid, #home-weekly-preview, #board-grid, #event-detail")
      .forEach((container) => empty(container, "Content could not be loaded. Check Firebase settings and Firestore rules."));
  } finally {
    window.dispatchEvent(new Event("vcktec:page-ready"));
  }
}

start();
