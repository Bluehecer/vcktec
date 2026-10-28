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
  js/cloudinary.js         Public Cloudinary image/video upload configuration
  js/firebase.js           Firebase web-app configuration
  js/site-ui.js            Branded startup loader, shared toasts, and live maintenance screen
firestore.rules            Firestore access controls
storage.rules              Legacy Firebase Storage rules (not used by the website)
```

Members can submit event proposals, complete VCKTEC Weekly stories, and batches of up to 20 gallery photos/videos. Submission records are held in Firestore's review queue until an owner, president, or editor approves them on `review.html`. Media is uploaded directly to Cloudinary and is publicly reachable by its URL even while a submission is pending. Editors can review submissions and edit/delete published events, posts, and gallery items; owners and presidents can also create and manage content. Only owners can manage board profiles. Owners and presidents manage account roles on `roles.html`; available roles are member, editor, and president (the owner role remains a one-time Firebase-console assignment). Email registration requires the member's name, and first-time Google profiles use the name returned by Google. Weekly posts show the contributor's name and publication date. Images are limited to 8 MB each and videos to 50 MB each in the website.

The owner can switch site-wide maintenance mode in the dashboard's **Reviews & members** tab. The live setting is stored at `settings/site_config` as a boolean `maintenanceMode`; visitors see an animated maintenance screen while approved owners, presidents, and editors can continue browsing. The first settings document is created when the owner changes the switch.

The shared cyber-tech loading intro and toast notifications are enabled on every site page. Managers see disabled, spinner-equipped submit buttons while content is being saved or uploaded.

Owners, presidents, and editors can create, edit, pause, or delete pop-up announcements on `announcement.html`. An announcement can include a message, optional image, optional display window, and a safe internal destination to a page or a specific event, album, or Weekly post. Visitors see the newest active announcement once per browser for each announcement ID; dismissing it records that ID in local browser storage. The public `updates.html` page lists all currently active announcements, so visitors can revisit a message after dismissing its pop-up.

## Configure Firebase

1. Create a Firebase project and register a Web app. Copy its web-app configuration into `assets/js/firebase.js`. These Firebase web configuration values are identifiers, not administrative credentials; never put a service-account key in this static site.
2. In Firebase Authentication, enable the **Email/Password** and **Google** providers. Add the GitHub Pages hostname (for example, `sudheeram4.github.io`) to Authentication → Settings → Authorized domains. Google sign-in creates a pending member profile on first use; managers must approve it before portal access.
3. Create a **Cloud Firestore** database and publish the latest rules in `firestore.rules`.
4. Configure Cloudinary uploads. The public cloud name and unsigned upload preset are in `assets/js/cloudinary.js` (currently `c3dbdnun` and `sudheera`). In the Cloudinary console, confirm the preset is **unsigned**, accepts the image formats used by the site and MP4/WebM/MOV video, and allows files up to 50 MB. The website applies the stricter 8 MB image and 50 MB video limits. Cloud name and preset name are public identifiers, not secrets; never put a Cloudinary API secret in this repository. No Firebase Storage bucket or Storage rules deployment is required.
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

The public homepage, events, event details, gallery albums, Weekly posts, About page, community question form, announcements, and board profiles are available without signing in. New accounts start as **pending** and cannot use member tools until approved. Owners and presidents can assign roles and approve registrations. Members may submit events, Weekly posts, photos, and videos to the Firestore review queue; an owner, president, or editor must approve them before they appear on the website. Editors can approve submissions, manage announcements, and edit/delete published events, Weekly posts, and gallery media. Only owners can add/edit/remove board profiles. Anonymous messages are stored in `anonymousSubmissions` without a name, email, or user ID; only owners and presidents can read, review, or delete them. Publish `firestore.rules` before enabling member submissions, approvals, and announcements. Firestore rules protect submission metadata and review actions; Cloudinary media uploaded through the unsigned preset is public by URL, including before approval. The website does not use Firebase Storage.

Because the anonymous form must allow unauthenticated writes from a static site, validation rules cannot prevent automated spam or guarantee sender anonymity beyond not collecting identity fields. Do not ask people to include sensitive or identifying information. For a public production deployment, enable Firebase App Check for the web app and monitor usage/Firestore quotas; the included honeypot is only a basic spam deterrent.

Images uploaded through the site are limited to 8 MB. The society emblem and school crest supplied for this project are already in `assets/images/`.

Events, Gallery, Weekly covers, announcements, board portraits, and member-submission media are uploaded to Cloudinary. Firestore stores the content, Cloudinary public ID, and secure URL; pending submission documents remain restricted by Firestore rules, but their Cloudinary media is public by URL. The cloud name and unsigned upload preset in `assets/js/cloudinary.js` are intentionally public configuration; do not add an API secret or service-account credential to this static site. Cloudinary assets are not deleted automatically when content is removed, replaced, rejected, or a Firestore save fails. Use the associated `*PublicId` value shown in the dashboard/review feedback to find unused assets and remove them manually in Cloudinary. `storage.rules` is retained only as a legacy file and is not required by the deployed website.

## Original ESP32 firmware

The original firmware remains in `src/main.cpp`, with board settings in `platformio.ini`. Follow the existing sketch comments to configure the Wi-Fi and Gemini credentials locally before building; do not publish real credentials to GitHub.
