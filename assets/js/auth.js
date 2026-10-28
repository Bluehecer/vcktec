import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db, isFirebaseConfigured } from "./firebase.js?v=20261028-cloudinary-media1";

let latestAccess = null;
const accessListeners = new Set();

export function subscribeToAccess(listener) {
  accessListeners.add(listener);
  if (latestAccess) listener(latestAccess);
  return () => accessListeners.delete(listener);
}

function notifyAccess(access) {
  latestAccess = access;
  accessListeners.forEach((listener) => listener(access));
}

function setAuthMessage(message, isError = false) {
  const target = document.querySelector("#auth-message");
  if (target) {
    target.textContent = message;
    target.classList.toggle("is-error", isError);
  }
  if (message) window.vcktecToast?.(message, isError ? "error" : "success");
}

function setAuthBusy(form, isBusy) {
  const button = form.matches("button") ? form : form.querySelector('button[type="submit"]');
  if (!button) return;
  if (isBusy) {
    const spinner = document.createElement("span");
    spinner.className = "button-spinner";
    spinner.setAttribute("aria-hidden", "true");
    button.append(spinner);
  } else {
    button.querySelector(".button-spinner")?.remove();
  }
  button.disabled = isBusy;
  button.setAttribute("aria-busy", String(isBusy));
}

function setupLoginForms() {
  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  setupGoogleSignIn();
  if (!loginForm || !registerForm) return;

  const loginTab = document.querySelector("#login-tab");
  const registerTab = document.querySelector("#register-tab");
  const loginPanel = document.querySelector("#login-panel");
  const registerPanel = document.querySelector("#register-panel");

  function selectPanel(panelName) {
    const showLogin = panelName === "login";
    loginPanel.hidden = !showLogin;
    registerPanel.hidden = showLogin;
    loginTab.classList.toggle("is-active", showLogin);
    registerTab.classList.toggle("is-active", !showLogin);
    loginTab.setAttribute("aria-selected", String(showLogin));
    registerTab.setAttribute("aria-selected", String(!showLogin));
    setAuthMessage("");
  }
  loginTab.addEventListener("click", () => selectPanel("login"));
  registerTab.addEventListener("click", () => selectPanel("register"));

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth || !isFirebaseConfigured) return;
    setAuthBusy(loginForm, true);
    setAuthMessage("");
    const data = new FormData(loginForm);
    try {
      await signInWithEmailAndPassword(auth, String(data.get("email")).trim(), String(data.get("password")));
      window.location.assign("admin.html");
    } catch (error) {
      console.error("VCKTEC sign-in failed:", error);
      setAuthMessage(error.message || "Sign-in failed. Check your email and password.", true);
    } finally {
      setAuthBusy(loginForm, false);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth || !db || !isFirebaseConfigured) return;
    setAuthBusy(registerForm, true);
    setAuthMessage("");
    const data = new FormData(registerForm);
    const name = String(data.get("name")).trim();
    if (!name) {
      setAuthBusy(registerForm, false);
      setAuthMessage("Enter your name so the society can identify your membership request.", true);
      registerForm.elements.name.focus();
      return;
    }
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        String(data.get("email")).trim(),
        String(data.get("password"))
      );
      await updateProfile(credential.user, { displayName: name });
      await setDoc(doc(db, "users", credential.user.uid), {
        name,
        email: credential.user.email,
        role: "pending",
        approved: false,
        createdAt: serverTimestamp()
      });
      await signOut(auth);
      registerForm.reset();
      selectPanel("login");
      setAuthMessage("Registration received. A society owner must approve your account before you can sign in.");
    } catch (error) {
      console.error("VCKTEC registration failed:", error);
      setAuthMessage(error.message || "Registration could not be completed. Please try again.", true);
    } finally {
      setAuthBusy(registerForm, false);
    }
  });
}

function setupGoogleSignIn() {
  const buttons = document.querySelectorAll("#google-signin-button, #google-register-button");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      if (!auth || !db || !isFirebaseConfigured) {
        setAuthMessage("Firebase is not configured. Add your project settings before signing in.", true);
        return;
      }
      setAuthBusy(button, true);
      setAuthMessage("");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      let signedInUid = null;
      try {
        const credential = await signInWithPopup(auth, provider);
        signedInUid = credential.user.uid;
        const profileRef = doc(db, "users", credential.user.uid);
        const profileSnapshot = await getDoc(profileRef);
        let profile = profileSnapshot.exists() ? profileSnapshot.data() : null;
        if (!profile) {
          if (!credential.user.email) throw new Error("Google did not provide an email address for this account.");
          profile = {
            name: credential.user.displayName || "VCKTEC member",
            email: credential.user.email,
            role: "pending",
            approved: false,
            createdAt: serverTimestamp()
          };
          await setDoc(profileRef, profile);
        }
        if (profile.approved === true) {
          window.location.assign("admin.html");
          return;
        }
        await signOut(auth);
        setAuthMessage("Your Google account is registered. A society manager must approve your membership before you can sign in.");
      } catch (error) {
        console.error("VCKTEC Google sign-in failed:", error);
        if (signedInUid && auth.currentUser?.uid === signedInUid) {
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.error("Could not sign out after the Google sign-in failure:", signOutError);
          }
        }
        if (error.code === "auth/popup-closed-by-user") {
          setAuthMessage("Google sign-in was cancelled.", true);
        } else if (error.code === "auth/popup-blocked") {
          setAuthMessage("Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.", true);
        } else if (error.code === "auth/unauthorized-domain") {
          setAuthMessage("Add this website's domain to Firebase Authentication's authorized domains.", true);
        } else if (error.code === "auth/operation-not-allowed") {
          setAuthMessage("Enable Google as a sign-in provider in Firebase Authentication.", true);
        } else {
          setAuthMessage(error.message || "Google sign-in could not be completed.", true);
        }
      } finally {
        setAuthBusy(button, false);
      }
    });
  });
}

function setupLogout() {
  const button = document.querySelector("#logout-button");
  if (!button) return;
  button.addEventListener("click", async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      window.location.assign("login.html");
    } catch (error) {
      console.error("VCKTEC sign-out failed:", error);
      const target = document.querySelector("#dashboard-message");
      if (target) {
        target.textContent = "Sign out failed. Please try again.";
        target.classList.add("is-error");
      }
    }
  });
}

if (!isFirebaseConfigured) {
  const note = document.querySelector("#firebase-config-note");
  if (note) note.hidden = false;
  setAuthMessage("Firebase is not configured. Add your Firebase project settings before using the member portal.", true);
  notifyAccess({ user: null, profile: null, configured: false });
  window.dispatchEvent(new Event("vcktec:page-ready"));
} else {
  setupLoginForms();
  setupLogout();
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      notifyAccess({ user: null, profile: null, configured: true });
      if (document.body.dataset.page === "login") window.dispatchEvent(new Event("vcktec:page-ready"));
      return;
    }
    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      const profile = profileSnapshot.exists() ? profileSnapshot.data() : null;
      notifyAccess({ user, profile, configured: true });
      if (document.querySelector("#login-form") && profile?.approved === true) {
        window.location.assign("admin.html");
      }
      if (document.body.dataset.page === "login") window.dispatchEvent(new Event("vcktec:page-ready"));
    } catch (error) {
      console.error("Could not verify the VCKTEC membership profile:", error);
      notifyAccess({ user, profile: null, configured: true, error });
      if (document.body.dataset.page === "login") window.dispatchEvent(new Event("vcktec:page-ready"));
    }
  }, (error) => {
    console.error("VCKTEC sign-in state could not be loaded:", error);
    setAuthMessage("Your sign-in state could not be checked. Please refresh the page.", true);
    if (document.body.dataset.page === "login") window.dispatchEvent(new Event("vcktec:page-ready"));
  });
}
