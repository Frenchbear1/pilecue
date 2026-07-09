# PileCue

PileCue is a photo-first cleanup sorting PWA for worker/client garage and estate cleanout workflows.

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` with the `VITE_FIREBASE_*` values from Firebase Project Settings.

## Firebase Products

- Authentication with Google sign-in
- Cloud Firestore for realtime job, item, and activity sync
- Cloud Storage for item photos

Deploy the included `firestore.rules` and `storage.rules` in Firebase Console before using the hosted app.

## GitHub Pages

The included workflow deploys the app to GitHub Pages on every push to `master` or `main`.

Add the Pages domain to Firebase Authentication authorized domains:

```text
Frenchbear1.github.io
```
