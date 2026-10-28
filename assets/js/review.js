import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { subscribeToAccess } from "./auth.js";
import { auth, db, isFirebaseConfigured } from "./firebase.js?v=20261028-cloudinary-media1";

let reviewer = null;

function setMessage(text, isError = false) {
  const target = document.querySelector("#review-message");
  target.textContent = text;
  target.classList.toggle("is-error", isError);
  if (text) window.vcktecToast?.(text, isError ? "error" : "success");
}

function emptyNote(text) {
  const note = document.createElement("p");
  note.className = "form-note";
  note.textContent = text;
  return note;
}

function dateLabel(value) {
  if (!value) return "Date not available";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not available" : date.toLocaleString();
}

function showGate(title, copy, login = false) {
  document.querySelector("#review-content").hidden = true;
  document.querySelector("#review-gate").hidden = false;
  document.querySelector("#review-gate-title").textContent = title;
  document.querySelector("#review-gate-copy").textContent = copy;
  document.querySelector("#review-gate-link").hidden = !login;
  window.dispatchEvent(new Event("vcktec:page-ready"));
}

async function makeReviewCard(entry) {
  const data = entry.data();
  const card = document.createElement("article");
  card.className = "review-submission-card";
  const heading = document.createElement("div");
  heading.className = "review-submission-heading";
  const type = document.createElement("span");
  type.className = "submission-badge";
  type.textContent = data.type === "media" ? `${data.mediaType || "media"} upload` : `${data.type || "submission"} post`;
  const submitted = document.createElement("small");
  submitted.textContent = `By ${data.submittedByName || "VCKTEC member"} · ${dateLabel(data.createdAt)}`;
  heading.append(type, submitted);
  card.append(heading);
  const title = document.createElement("h3");
  title.textContent = data.title || data.album || "Untitled submission";
  card.append(title);
  if (data.topic) card.append(textNode("p", `Topic: ${data.topic}`));
  if (data.date) card.append(textNode("p", `Date: ${data.date}${data.time ? ` · ${data.time}` : ""}${data.venue ? ` · ${data.venue}` : ""}`));
  if (data.album) card.append(textNode("p", `Album: ${data.album}`));
  if (data.excerpt) card.append(textNode("p", data.excerpt, "review-excerpt"));
  if (data.description) card.append(textNode("p", data.description, "review-description"));
  if (data.caption) card.append(textNode("p", data.caption));
  if (Array.isArray(data.tags) && data.tags.length) card.append(textNode("p", `Tags: ${data.tags.join(", ")}`));
  if (Array.isArray(data.sources) && data.sources.length) {
    const sourceList = document.createElement("div");
    sourceList.className = "review-sources";
    data.sources.forEach((source) => {
      const link = document.createElement("a");
      link.href = source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source;
      sourceList.append(link);
    });
    card.append(sourceList);
  }
  let mediaUrl = data.coverImageUrl || data.imageUrl || data.mediaUrl;
  if (!mediaUrl && data.coverStoragePath) {
    card.append(textNode("p", "This older submission has a Firebase Storage-only cover that cannot be previewed. Ask the member to resubmit it."));
  }
  if (mediaUrl) {
    const media = data.mediaType === "video"
      ? document.createElement("video")
      : document.createElement("img");
    media.className = "review-submission-media";
    media.src = mediaUrl;
    if (media.tagName === "VIDEO") {
      media.controls = true;
      media.preload = "metadata";
    } else {
      media.alt = data.title || data.album || "Member submission preview";
      media.loading = "lazy";
    }
    card.append(media);
  }
  const actions = document.createElement("div");
  actions.className = "managed-actions review-actions";
  actions.append(actionButton("Approve & publish", () => approveSubmission(entry), "mini-button review-approve"));
  actions.append(actionButton("Reject", () => rejectSubmission(entry), "mini-button danger"));
  actions.append(actionButton("Delete", () => deleteSubmission(entry), "mini-button danger"));
  card.append(actions);
  return card;
}

function textNode(tagName, text, className = "") {
  const node = document.createElement(tagName);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function actionButton(label, handler, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await handler(); }
    finally { button.disabled = false; }
  });
  return button;
}

async function loadQueue() {
  const container = document.querySelector("#content-review-queue");
  container.replaceChildren(emptyNote("Loading member submissions…"));
  const snapshot = await getDocs(query(collection(db, "contentSubmissions"), where("status", "==", "pending")));
  const submissions = [...snapshot.docs].sort((first, second) => {
    const a = first.data().createdAt;
    const b = second.data().createdAt;
    return (b?.toMillis?.() || 0) - (a?.toMillis?.() || 0);
  });
  if (!submissions.length) {
    container.replaceChildren(emptyNote("No member submissions are waiting for approval."));
    return;
  }
  const cards = await Promise.all(submissions.map(makeReviewCard));
  container.replaceChildren(...cards);
}

function publicCollectionFor(type) {
  if (type === "event") return "events";
  if (type === "weekly") return "weeklyPosts";
  if (type === "media") return "gallery";
  throw new Error("This submission type cannot be published.");
}

function publicContent(data) {
  if (data.type === "event") {
    return {
      title: data.title,
      topic: data.topic || "",
      venue: data.venue || "",
      date: data.date,
      time: data.time,
      endDate: data.endDate || "",
      endTime: data.endTime || "",
      description: data.description,
      tags: data.tags || [],
      coverImageUrl: data.coverImageUrl || "",
      coverImagePublicId: data.coverImagePublicId || "",
      createdAt: serverTimestamp(),
      createdBy: data.submittedBy,
      createdByName: data.submittedByName
    };
  }
  if (data.type === "weekly") {
    return {
      title: data.title,
      topic: data.topic,
      excerpt: data.excerpt,
      description: data.description,
      tags: data.tags || [],
      sourceUrl: data.sourceUrl,
      sources: data.sources || [],
      imageUrl: data.imageUrl,
      imagePublicId: data.imagePublicId || "",
      authorName: data.submittedByName || "VCKTEC member",
      createdBy: data.submittedBy,
      createdAt: serverTimestamp(),
      publishedAt: new Date().toISOString().slice(0, 10)
    };
  }
  return {
    album: data.album,
    caption: data.caption || "",
    eventId: data.eventId || "",
    mediaUrl: data.mediaUrl,
    mediaType: data.mediaType,
    mediaPublicId: data.mediaPublicId || "",
    createdAt: serverTimestamp(),
    createdBy: data.submittedBy,
    createdByName: data.submittedByName
  };
}

async function approveSubmission(entry) {
  const data = entry.data();
  const publicRef = doc(collection(db, publicCollectionFor(data.type)));
  const batch = writeBatch(db);
  try {
    if (data.coverStoragePath && !data.coverImageUrl) {
      throw new Error("This older submission's cover is stored only in Firebase Storage. Ask the member to resubmit it with the current upload form.");
    }
    batch.set(publicRef, {
      ...publicContent(data),
      submissionId: entry.id
    });
    batch.update(doc(db, "contentSubmissions", entry.id), {
      status: "approved",
      reviewedBy: reviewer.uid,
      reviewedByName: reviewer.name || reviewer.email || "VCKTEC editor",
      reviewedAt: serverTimestamp(),
      publishedContentId: publicRef.id
    });
    await batch.commit();
    setMessage("Submission approved and published.");
    try { await loadQueue(); }
    catch (error) {
      console.error("Submission published, but the review queue could not be refreshed:", error);
      setMessage("Submission published, but the review queue could not be refreshed. Reload the page to see the updated queue.", true);
    }
  } catch (error) {
    console.error("Could not approve the VCKTEC member submission:", error);
    setMessage(error.message || "The submission could not be published.", true);
  }
}

async function rejectSubmission(entry) {
  try {
    await updateDoc(doc(db, "contentSubmissions", entry.id), {
      status: "rejected",
      reviewedBy: reviewer.uid,
      reviewedByName: reviewer.name || reviewer.email || "VCKTEC editor",
      reviewedAt: serverTimestamp()
    });
    const data = entry.data();
    const publicId = data.mediaPublicId || data.imagePublicId || data.coverImagePublicId;
    setMessage(publicId
      ? `Submission rejected. Cloudinary asset ${publicId} remains publicly reachable until removed in Cloudinary.`
      : "Submission rejected. It was not published.");
    await loadQueue();
  } catch (error) {
    console.error("Could not reject the VCKTEC member submission:", error);
    setMessage(error.message || "The submission could not be rejected.", true);
  }
}

async function deleteSubmission(entry) {
  if (!window.confirm("Permanently delete this submission? Uploaded Cloudinary media will remain in the Cloudinary library.")) return;
  try {
    await deleteDoc(doc(db, "contentSubmissions", entry.id));
    const data = entry.data();
    const publicId = data.mediaPublicId || data.imagePublicId || data.coverImagePublicId;
    setMessage(publicId
      ? `Submission deleted. Cloudinary asset ${publicId} remains in the media library.`
      : "Submission deleted.");
    await loadQueue();
  } catch (error) {
    console.error("Could not delete the VCKTEC member submission:", error);
    setMessage(error.message || "The submission could not be deleted.", true);
  }
}

async function showReview(access) {
  if (!access.configured) return showGate("Firebase setup needed.", "Configure Firebase to review member submissions.");
  if (!access.user) return showGate("Sign in to continue.", "Only approved owners, presidents and editors can review submissions.", true);
  if (access.error) return showGate("Could not verify your access.", "Refresh the page or check your connection.", true);
  if (!["owner", "president", "editor"].includes(access.profile?.role) || access.profile.approved !== true) {
    return showGate("Review access is restricted.", "Only an approved owner, president or editor can open this page.", true);
  }
  reviewer = { uid: access.user.uid, email: access.user.email, ...access.profile };
  document.querySelector("#review-gate").hidden = true;
  document.querySelector("#review-content").hidden = false;
  try {
    await loadQueue();
  } catch (error) {
    console.error("Could not load VCKTEC member submissions:", error);
    setMessage(error.message || "The review queue could not be loaded.", true);
  } finally {
    window.dispatchEvent(new Event("vcktec:page-ready"));
  }
}

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.assign("login.html");
  } catch (error) {
    console.error("Could not sign out from VCKTEC submission review:", error);
    setMessage("Sign out failed. Please try again.", true);
  }
});

if (!isFirebaseConfigured) showGate("Firebase setup needed.", "Configure Firebase to review member submissions.");
else subscribeToAccess(showReview);
