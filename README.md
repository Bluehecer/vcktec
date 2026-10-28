# VCKTEC website and ESP32 talking robot

This repository contains the responsive public website for Vidyartha College Kandy Technology Society (VCKTEC), plus the original ESP32 talking-robot firmware in `src/`.

## Website structure

```text
index.html                 Home and previews of events, albums, and VCKTEC Weekly
events.html                Upcoming and past event listings
event.html                 Full event details and its archive link
gallery.html               Public event and society albums
album.html                 Full-size photo and video album viewer
weekly.html                Technology stories, tags, and linked sources
board.html                 Public society leadership profiles
about.html                 Society introduction and values
community.html             Anonymous public questions and suggestions
login.html                 Firebase member sign-in and registration
admin.html                 Tabbed member portal and content manager
review.html                Private approval queue for member content submissions
roles.html                 Owner/president-only member and role management
announcement.html         Owner/president/editor announcement composer
updates.html              Public archive of currently active announcements
assets/
  css/style.css            Responsive custom styling
  images/school-logo.jpg   Supplied Vidyartha College crest
  images/society-logo.jpg  Supplied VCKTEC emblem
  js/app.js                Public Firestore content, detail pages, and media viewer
  js/auth.js               Email/Google sign-in, registration, and membership-state handling
  js/community.js          Anonymous question/suggestion form submission
  js/admin.js              Event, album, Weekly, board, submission, and membership management
  js/review.js             Owner/president/editor approval and publishing workflow
  js/roles.js              Owner/president role assignments and account approvals
  js/announcements.js      Public one-time announcement pop-up display
  js/announcements-admin.js Announcement editor, destinations, and lifecycle
  js/cloudinary.js         Public Cloudinary image-upload configuration
  js/firebase.js           Firebase web-app configuration
  js/site-ui.js            Branded startup loader, shared toasts, and live maintenance screen
firestore.rules            Firestore access controls
storage.rules              Photo/video upload and storage access controls
```

Members can submit event proposals, complete VCKTEC Weekly stories, and batches of up to 20 gallery photos/videos. These are held privately until an owner, president, or editor approves them on `review.html`. Editors can review submissions and edit/delete published events, posts, and gallery items; owners and presidents can also create and manage content. Only owners can manage board profiles. Owners and presidents manage account roles on `roles.html`; available roles are member, editor, and president (the owner role remains a one-time Firebase-console assignment). Email registration requires the member's name, and first-time Google profiles use the name returned by Google. Weekly posts show the contributor's name and publication date. Images are limited to 8 MB each and videos to 50 MB each.

The owner can switch site-wide maintenance mode in the dashboard's **Reviews & members** tab. The live setting is stored at `settings/site_config` as a boolean `maintenanceMode`; visitors see an animated maintenance screen while approved owners, presidents, and editors can continue browsing. The first settings document is created when the owner changes the switch.

The shared cyber-tech loading intro and toast notifications are enabled on every site page. Managers see disabled, spinner-equipped submit buttons while content is being saved or uploaded.

Owners, presidents, and editors can create, edit, pause, or delete pop-up announcements on `announcement.html`. An announcement can include a message, optional image, optional display window, and a safe internal destination to a page or a specific event, album, or Weekly post. Visitors see the newest active announcement once per browser for each announcement ID; dismissing it records that ID in local browser storage. The public `updates.html` page lists all currently active announcements, so visitors can revisit a message after dismissing its pop-up.

## Configure Firebase

1. Create a Firebase project and register a Web app. Copy its web-app configuration into `assets/js/firebase.js`. These Firebase web configuration values are identifiers, not administrative credentials; never put a service-account key in this static site.
2. In Firebase Authentication, enable the **Email/Password** and **Google** providers. Add the GitHub Pages hostname (for example, `sudheeram4.github.io`) to Authentication → Settings → Authorized domains. Google sign-in creates a pending member profile on first use; managers must approve it before portal access.
3. Create a **Cloud Firestore** database and publish the latest rules in `firestore.rules`.
4. Set up **Firebase Storage** and publish the rules in `storage.rules`. Use the exact storage bucket value shown in the Firebase project settings for `storageBucket` in `assets/js/firebase.js`. Storage availability, free quotas, and billing requirements can change; check the Firebase console before enabling any paid plan.
5. Register the society owner's account through `login.html`. In Authentication → Users, copy that account's UID. In Firestore, create a document at `users/{OWNER_UID}` with these fields:

   ```text
   name:     owner's display name (string)
   email:    owner's sign-in email (string)
   role:     "owner" (string)
   approved: true (boolean)
   createdAt: current timestamp
   ```

   This one-time console setup makes the first owner without weakening public registration or letting users grant themselves privileges. After signing in, owners and presidents can approve registrations and assign member, editor, or president roles on the dedicated role-management page.
6. Upload the site files to the repository's GitHub Pages source. A local HTTP server is required for testing because browser modules do not work reliably from a `file:` URL. For example, from the repository root run `python -m http.server 8000`, then open `http://localhost:8000`.

The public homepage, events, event details, gallery albums, Weekly posts, About page, community question form, announcements, and board profiles are available without signing in. New accounts start as **pending** and cannot use member tools until approved. Owners and presidents can assign roles and approve registrations. Members may submit events, Weekly posts, photos, and videos to the private review queue; an owner, president, or editor must approve them before they appear publicly. Editors can approve submissions, manage announcements, and edit/delete published events, Weekly posts, and gallery media. Only owners can add/edit/remove board profiles. Anonymous messages are stored in `anonymousSubmissions` without a name, email, or user ID; only owners and presidents can read, review, or delete them. Publish both updated `firestore.rules` and `storage.rules` before enabling member uploads, approvals, and announcements. Firestore and Storage rules enforce these permissions—the page visibility checks are only the user interface.

Because the anonymous form must allow unauthenticated writes from a static site, validation rules cannot prevent automated spam or guarantee sender anonymity beyond not collecting identity fields. Do not ask people to include sensitive or identifying information. For a public production deployment, enable Firebase App Check for the web app and monitor usage/Firestore quotas; the included honeypot is only a basic spam deterrent.

Images uploaded through the site are limited to 8 MB. The society emblem and school crest supplied for this project are already in `assets/images/`.

Published event covers and announcement images are stored in Cloudinary; their metadata and image URLs remain in Firestore. The Cloudinary cloud name and unsigned upload preset are configured in `assets/js/cloudinary.js`; verify that the preset restricts uploads to JPG, PNG, WebP, or GIF images up to 8 MB. These values and the preset are public; never add a Cloudinary API secret to this static site. Member event covers stay in Firebase Storage while pending and are transferred to Cloudinary when approved, so unapproved covers are not publicly accessible. Cloudinary assets are not deleted automatically when content is removed or its image is replaced; use the stored `coverImagePublicId` for events and the `cloudinary:`-prefixed `imageStoragePath` for announcements to manage unused assets in Cloudinary.

## Original ESP32 firmware

The original firmware remains in `src/main.cpp`, with board settings in `platformio.ini`. Follow the existing sketch comments to configure the Wi-Fi and Gemini credentials locally before building; do not publish real credentials to GitHub.
