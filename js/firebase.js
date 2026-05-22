import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, setDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMNZqftNtpHVpRufvipO_NfQxcqYgUszI",
  authDomain: "homeharmony-87579.firebaseapp.com",
  projectId: "homeharmony-87579",
  storageBucket: "homeharmony-87579.firebasestorage.app",
  messagingSenderId: "1013954583227",
  appId: "1:1013954583227:web:6cba84b97583a1da27279e",
  measurementId: "G-1V9QKHR787"
};

const hasFirebaseConfig = !firebaseConfig.apiKey.startsWith("PASTE_");
export const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;

const emptySettings = {
  id: "main",
  recyclingDay: "",
  generalWasteDay: "",
  gardenWasteDay: "",
  updateDay: "",
  currentRoom: "",
  nextRoom: ""
};

export const isDemo = !hasFirebaseConfig;

export function toast(message) {
  const root = document.querySelector("#toast-root");
  if (!root) return;
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  root.append(item);
  setTimeout(() => item.remove(), 3200);
}

export function currentRoomId() {
  return localStorage.getItem("homeharmony_room_doc_id");
}

export function requireRoomSession() {
  if (localStorage.getItem("homeharmony_admin") === "true") {
    localStorage.removeItem("homeharmony_admin");
  }
  const id = currentRoomId();
  if (!id) location.href = "login.html";
  return id;
}

export function requireAdminSession() {
  if (localStorage.getItem("homeharmony_admin") !== "true") location.href = "admin-login.html";
}

export function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : new Date();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function nav(role = "user") {
  const userLinks = [
    ["Dashboard", "dashboard.html", "⌂"], ["My Turn", "my-turn.html", "✓"], ["Schedule", "schedule.html", "◷"], ["Notices", "notices.html", "✉"], ["History", "history.html", "◌"], ["Settings", "settings.html", "⚙"]
  ];
  const adminLinks = [
    ["Admin", "admin-dashboard.html", "⌂"], ["Rooms", "room-management.html", "▦"], ["Notices", "notice-management.html", "✉"], ["History", "admin-history.html", "◌"], ["Settings", "settings.html", "⚙"]
  ];
  const links = role === "admin" ? adminLinks : userLinks;
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach((target) => {
    target.innerHTML = `<a class="brand nav-brand" href="dashboard.html"><span class="brand-mark">H</span><span>Home<span>Harmony</span></span></a>` +
      links.map(([label, href, icon]) => (
        `<a class="nav-link ${path === href ? "active" : ""}" href="${href}"><span>${icon}</span><span>${label}</span></a>`
      )).join("");
  });
}

function demoRead(name) {
  if (name === "rooms") return JSON.parse(localStorage.getItem("hh_demo_rooms")) || [];
  if (name === "settings") return JSON.parse(localStorage.getItem("hh_demo_settings")) || emptySettings;
  if (name === "notices") return JSON.parse(localStorage.getItem("hh_demo_notices")) || [];
  if (name === "history") return JSON.parse(localStorage.getItem("hh_demo_history")) || [];
  return [];
}

function demoWrite(name, data) {
  localStorage.setItem(`hh_demo_${name}`, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(`hh-demo-${name}`));
}

function demoSubscribe(name, callback, mapper = (value) => value) {
  const emit = () => callback(mapper(demoRead(name)));
  emit();
  window.addEventListener(`hh-demo-${name}`, emit);
  return () => window.removeEventListener(`hh-demo-${name}`, emit);
}

export async function validateRoomCode(code) {
  if (isDemo) return demoRead("rooms").find((room) => room.loginCode === code && !room.disabled) || null;
  const snap = await getDocs(query(collection(db, "rooms"), where("loginCode", "==", code), limit(1)));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function validateAdmin(adminId, pin) {
  if (isDemo) return false;
  const cleanAdminId = String(adminId || "").trim().toLowerCase();
  const cleanPin = String(pin || "").trim();

  const matchesAdmin = (adminDoc) => {
    const admin = adminDoc.data();
    const storedAdminId = String(admin.adminId || adminDoc.id || "").trim().toLowerCase();
    const storedPin = String(admin.pin || "").trim();
    return storedAdminId === cleanAdminId && storedPin === cleanPin;
  };

  const collectionsToCheck = ["admin", "rooms"];

  for (const collectionName of collectionsToCheck) {
    const directDoc = await getDoc(doc(db, collectionName, cleanAdminId));
    if (directDoc.exists() && matchesAdmin(directDoc)) return true;

    const byId = await getDocs(query(collection(db, collectionName), where("adminId", "==", String(adminId || "").trim()), limit(5)));
    if (byId.docs.some(matchesAdmin)) return true;

    const numericPin = Number(cleanPin);
    if (Number.isFinite(numericPin)) {
      const byIdAndNumericPin = await getDocs(query(
        collection(db, collectionName),
        where("adminId", "==", String(adminId || "").trim()),
        where("pin", "==", numericPin),
        limit(1)
      ));
      if (!byIdAndNumericPin.empty) return true;
    }
  }

  return false;
}

export async function getRoom(id) {
  if (isDemo) return demoRead("rooms").find((room) => room.id === id || room.roomName === id);
  const snap = await getDoc(doc(db, "rooms", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateRoom(id, data) {
  if (isDemo) {
    const rooms = demoRead("rooms").map((room) => room.id === id ? { ...room, ...data } : room);
    demoWrite("rooms", rooms);
    return;
  }
  await updateDoc(doc(db, "rooms", id), data);
}

export async function uploadProfilePhoto(roomId, file) {
  if (!file) return "";
  if (isDemo) return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  const fileRef = ref(storage, `profiles/${roomId}/${Date.now()}-${file.name}`);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}

export function subscribeRooms(callback) {
  if (isDemo) return demoSubscribe("rooms", callback, (items) => items.sort((a, b) => a.turnOrder - b.turnOrder));
  return onSnapshot(query(collection(db, "rooms"), orderBy("turnOrder")), (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function subscribeSettings(callback) {
  if (isDemo) return demoSubscribe("settings", callback);
  return onSnapshot(doc(db, "wasteSettings", "main"), (snap) => callback({ id: snap.id, ...snap.data() }));
}

export function subscribeNotices(callback) {
  if (isDemo) return demoSubscribe("notices", callback);
  return onSnapshot(query(collection(db, "notices"), orderBy("createdAt", "desc")), (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function subscribeHistory(callback) {
  if (isDemo) return demoSubscribe("history", callback);
  return onSnapshot(query(collection(db, "history"), orderBy("createdAt", "desc")), (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function saveSettings(data) {
  if (isDemo) return demoWrite("settings", { ...demoRead("settings"), ...data });
  await setDoc(doc(db, "wasteSettings", "main"), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function createNotice(data) {
  if (isDemo) {
    const notices = [{ id: crypto.randomUUID(), ...data, createdAt: new Date() }, ...demoRead("notices")];
    demoWrite("notices", notices);
    return;
  }
  await addDoc(collection(db, "notices"), { ...data, createdAt: serverTimestamp() });
}

export async function createHistory(action, roomId = "") {
  if (isDemo) {
    const history = [{ id: crypto.randomUUID(), action, roomId, createdAt: new Date() }, ...demoRead("history")];
    demoWrite("history", history);
    return;
  }
  await addDoc(collection(db, "history"), { action, roomId, createdAt: serverTimestamp() });
}
