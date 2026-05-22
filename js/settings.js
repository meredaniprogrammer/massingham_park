import { getRoom, nav, requireRoomSession, toast, updateRoom, uploadProfilePhoto } from "./firebase.js";

const roomId = requireRoomSession();
nav("user");

const form = document.querySelector("#settingsForm") || document.querySelector("#setupForm");
const preview = document.querySelector("#profilePreview");
const fileInput = document.querySelector("#profilePhoto");
const logout = document.querySelector("#logout");
const generateLoginCode = document.querySelector("#generateLoginCode");

function makeLoginCode() {
  const roomPart = (localStorage.getItem("homeharmony_room_name") || "ROOM")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 5);
  return `${roomPart}-${suffix}`;
}

async function init() {
  const room = await getRoom(roomId);
  if (!room) return;
  if (form?.displayName) form.displayName.value = room.displayName || "";
  if (form?.loginCode) form.loginCode.value = room.loginCode || "";
  if (preview && room.profilePhoto) preview.src = room.profilePhoto;
}

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file && preview) preview.src = URL.createObjectURL(file);
});

generateLoginCode?.addEventListener("click", () => {
  if (form?.loginCode) form.loginCode.value = makeLoginCode();
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const file = fileInput?.files?.[0];
    const photoUrl = file ? await uploadProfilePhoto(roomId, file) : "";
    const update = { displayName: form.displayName.value.trim() };
    if (form.loginCode) update.loginCode = form.loginCode.value.trim().toUpperCase();
    if (photoUrl) update.profilePhoto = photoUrl;
    await updateRoom(roomId, update);
    toast("Profile saved.");
    if (location.pathname.endsWith("setup.html")) setTimeout(() => location.href = "dashboard.html", 500);
  } catch (error) {
    console.error(error);
    toast("Could not save settings.");
  } finally {
    button.disabled = false;
    button.textContent = location.pathname.endsWith("setup.html") ? "Save profile" : "Save settings";
  }
});

logout?.addEventListener("click", () => {
  localStorage.removeItem("homeharmony_room_doc_id");
  localStorage.removeItem("homeharmony_room_name");
  location.href = "login.html";
});

init();
