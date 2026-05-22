# HomeHarmony

A premium static house-share management app using HTML, CSS, vanilla JavaScript, Firebase Firestore, Firebase Storage, and Netlify hosting.

## Firebase setup

1. Create a Firebase web app and enable Firestore and Storage.
2. Open `js/firebase.js` and replace the placeholder `firebaseConfig` values.
3. Create initial collections or click through the app in demo mode, then seed Firestore with the structure documented in the prompt.
4. Create your own Firestore data for `rooms`, `admin`, and `wasteSettings/main`.
5. Deploy the folder to Netlify. `netlify.toml` publishes the project root.

This app intentionally does not use Firebase Authentication. Room and admin access are validated against Firestore documents.

## Required Firestore collections

`rooms`

Each room document should include:

- `roomName` string
- `loginCode` string
- `displayName` string
- `profilePhoto` string
- `isAvailable` boolean
- `turnOrder` number
- `disabled` boolean

`admin`

Each admin document should include:

- `adminId` string
- `pin` string

`wasteSettings/main`

The document ID must be `main` and should include:

- `recyclingDay` string
- `generalWasteDay` string
- `gardenWasteDay` string
- `updateDay` string
- `currentRoom` string
- `nextRoom` string
