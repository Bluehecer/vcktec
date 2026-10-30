const loader = document.querySelector("#global-loader");
const startedAt = performance.now();
const minimumLoaderTime = 650;
const maxStartupWait = 3600;
let windowLoaded = document.readyState === "complete";
let pageReady = false;
let settingsReady = false;
let roleReady = false;
let canBypassMaintenance = false;
let maintenanceEnabled = false;
let loaderRemoved = false;
let loaderExitTimer = null;

loader?.querySelector(".loader-logo")?.addEventListener("error", (event) => {
  event.currentTarget.hidden = true;
});

function toast(message, type = "info") {
  if (!message) return;
  let region = document.querySelector("#toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-relevant", "additions");
    document.body.append(region);
  }
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.setAttribute("role", type === "error" ? "alert" : "status");
  const marker = document.createElement("span");
  marker.className = "toast-marker";
  marker.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = message;
  item.append(marker, text);
  region.append(item);
  requestAnimationFrame(() => item.classList.add("is-visible"));
  window.setTimeout(() => {
    item.classList.remove("is-visible");
    window.setTimeout(() => item.remove(), 240);
  }, 3000);
}

window.vcktecToast = toast;

function showMaintenanceScreen() {
  if (document.querySelector("#maintenance-screen")) return;
  const screen = document.createElement("section");
  screen.id = "maintenance-screen";
  screen.className = "maintenance-screen";
  screen.setAttribute("role", "dialog");
  screen.setAttribute("aria-modal", "true");
  screen.setAttribute("aria-labelledby", "maintenance-title");
  screen.tabIndex = -1;
  const panel = document.createElement("div");
  panel.className = "maintenance-panel";
  const emblem = document.createElement("div");
  emblem.className = "maintenance-emblem";
  const logo = document.createElement("img");
  logo.src = "assets/images/society-logo.jpg";
  logo.alt = "";
  const orbit = document.createElement("span");
  orbit.className = "maintenance-orbit";
  emblem.append(logo, orbit);
  const kicker = document.createElement("p");
  kicker.className = "section-kicker";
  kicker.textContent = "VCKTEC · SIGNAL REFRESH";
  const title = document.createElement("h1");
  title.id = "maintenance-title";
  title.append(document.createTextNode("A brighter "));
  const glow = document.createElement("span");
  glow.className = "gradient-text";
  glow.textContent = "signal is coming.";
  title.append(glow);
  const copy = document.createElement("p");
  copy.className = "maintenance-copy";
  copy.textContent = "We’re tuning the technology, refining the experience, and getting everything ready for what’s next.";
  const caption = document.createElement("p");
  caption.className = "maintenance-caption";
  caption.textContent = "The ideas haven’t stopped. We’ll be back online soon.";
  const status = document.createElement("div");
  status.className = "maintenance-status";
  status.append(elementStatusDot(), document.createTextNode("BUILDING TOMORROW, TOGETHER"));
  panel.append(emblem, kicker, title, copy, caption, status);
  screen.append(panel);
  document.body.append(screen);
  document.querySelectorAll("body > header, body > main, body > footer").forEach((region) => {
    region.inert = true;
  });
  screen.focus({ preventScroll: true });
  screen.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      screen.focus();
    }
  });
}

function elementStatusDot() {
  const dot = document.createElement("span");
  dot.className = "live-dot";
  return dot;
}

function syncMaintenanceScreen() {
  if (maintenanceEnabled && !canBypassMaintenance) showMaintenanceScreen();
  else {
    document.querySelector("#maintenance-screen")?.remove();
    document.querySelectorAll("body > header, body > main, body > footer").forEach((region) => {
      region.inert = false;
    });
  }
}

function maybeHideLoader() {
  if (!loader || loaderRemoved || !windowLoaded || !pageReady || !settingsReady || !roleReady) return;
  if (loaderExitTimer !== null) return;
  const remaining = Math.max(0, minimumLoaderTime - (performance.now() - startedAt));
  loaderExitTimer = window.setTimeout(hideLoader, remaining);
}

function hideLoader() {
  if (!loader || loaderRemoved) return;
  loaderRemoved = true;
  loader.classList.add("loader-exit");
  window.setTimeout(() => loader.remove(), 520);
}

window.addEventListener("load", () => {
  windowLoaded = true;
  maybeHideLoader();
  window.setTimeout(() => {
    pageReady = true;
    if (!settingsReady || !roleReady) {
      toast("Some live content is taking longer than usual. You can still explore the site.", "info");
    }
    settingsReady = true;
    roleReady = true;
    maybeHideLoader();
  }, 2600);
});

window.setTimeout(() => {
  if (loaderRemoved) return;
  windowLoaded = true;
  pageReady = true;
  settingsReady = true;
  roleReady = true;
  hideLoader();
}, maxStartupWait);

if (windowLoaded) {
  window.setTimeout(() => {
    pageReady = true;
    maybeHideLoader();
  }, 0);
}

window.addEventListener("vcktec:page-ready", () => {
  pageReady = true;
  maybeHideLoader();
});

async function initializeFirebaseUi() {
  const [{ auth, db, isFirebaseConfigured }, { onAuthStateChanged }, { doc, getDoc, onSnapshot }] = await Promise.all([
    import("./firebase.js"),
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js")
  ]);
  if (!isFirebaseConfigured || !auth || !db) {
    settingsReady = true;
    roleReady = true;
    maybeHideLoader();
    return;
  }

  const accessPromise = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        canBypassMaintenance = false;
        roleReady = true;
        syncMaintenanceScreen();
        maybeHideLoader();
        resolve();
        return;
      }
      try {
        const profile = await getDoc(doc(db, "users", user.uid));
        const role = profile.exists() ? profile.data().role : "";
        canBypassMaintenance = profile.data()?.approved === true && ["owner", "president", "editor"].includes(role);
        syncMaintenanceScreen();
      } catch (error) {
        console.error("Could not verify VCKTEC maintenance access:", error);
        toast("Your access level could not be checked. Contact a society manager if the site is in maintenance.", "error");
      } finally {
        roleReady = true;
        maybeHideLoader();
        resolve();
      }
    }, (error) => {
      console.error("Could not check the signed-in VCKTEC account:", error);
      roleReady = true;
      maybeHideLoader();
      resolve();
    });
  });

  const settingsPromise = new Promise((resolve) => {
    let firstSnapshot = true;
    const stopWatching = onSnapshot(doc(db, "settings", "site_config"), (snapshot) => {
      maintenanceEnabled = snapshot.exists() && snapshot.data().maintenanceMode === true;
      syncMaintenanceScreen();
      if (firstSnapshot) {
        firstSnapshot = false;
        settingsReady = true;
        maybeHideLoader();
        resolve();
      }
    }, (error) => {
      console.error("Could not read VCKTEC site settings:", error);
      toast("The site settings could not be loaded. Public pages remain available.", "error");
      settingsReady = true;
      maybeHideLoader();
      if (firstSnapshot) {
        firstSnapshot = false;
        resolve();
      }
    });
    window.addEventListener("pagehide", stopWatching, { once: true });
  });

  Promise.all([accessPromise, settingsPromise]).catch((error) => {
    console.error("VCKTEC site initialization failed:", error);
    settingsReady = true;
    roleReady = true;
    maybeHideLoader();
  });
}

initializeFirebaseUi().catch((error) => {
  console.error("Could not initialize Firebase site services:", error);
  settingsReady = true;
  roleReady = true;
  maybeHideLoader();
});
