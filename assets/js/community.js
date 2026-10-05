import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, isFirebaseConfigured } from "./firebase.js";

const form = document.querySelector("#anonymous-form");
const message = document.querySelector("#community-message");
const submitButton = form.querySelector('button[type="submit"]');

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("is-error", isError);
  if (text) window.vcktecToast?.(text, isError ? "error" : "success");
}

function setBusy(isBusy) {
  submitButton.disabled = isBusy;
  submitButton.setAttribute("aria-busy", String(isBusy));
  if (isBusy) {
    const spinner = document.createElement("span");
    spinner.className = "button-spinner";
    spinner.setAttribute("aria-hidden", "true");
    submitButton.append(spinner);
  } else submitButton.querySelector(".button-spinner")?.remove();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isFirebaseConfigured || !db) {
    showMessage("The anonymous question box is not connected yet. Please try again later.", true);
    return;
  }
  const data = new FormData(form);
  if (String(data.get("website") || "").trim()) {
    form.reset();
    showMessage("Thanks. If you have another question, please use the form.", false);
    return;
  }
  const topic = String(data.get("topic") || "").trim();
  const text = String(data.get("message") || "").trim();
  if (topic.length < 2 || text.length < 10 || text.length > 2000) {
    showMessage("Add a short topic and a message between 10 and 2,000 characters.", true);
    return;
  }
  setBusy(true);
  showMessage("");
  try {
    await addDoc(collection(db, "anonymousSubmissions"), {
      type: data.get("type") === "suggestion" ? "suggestion" : "question",
      topic,
      message: text,
      status: "pending",
      createdAt: serverTimestamp()
    });
    form.reset();
    showMessage("Your message has been sent privately to the VCKTEC team. Thank you for sharing it.");
  } catch (error) {
    console.error("Could not send the anonymous VCKTEC message:", error);
    showMessage("Your message could not be sent just now. Please try again later.", true);
  } finally {
    setBusy(false);
    window.dispatchEvent(new Event("vcktec:page-ready"));
  }
});

if (!isFirebaseConfigured || !db) {
  showMessage("This private question box is not connected yet. Please try again later.", true);
  window.dispatchEvent(new Event("vcktec:page-ready"));
} else window.dispatchEvent(new Event("vcktec:page-ready"));

const year = document.querySelector("#current-year");
if (year) year.textContent = String(new Date().getFullYear());
