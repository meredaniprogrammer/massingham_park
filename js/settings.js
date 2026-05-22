import { getRoom, nav, requireRoomSession, toast, updateRoom, uploadProfilePhoto } from "./firebase.js";

const roomId = requireRoomSession();
nav("user");

const form = document.querySelector("#settingsForm") || document.querySelector("#setupForm");
const preview = document.querySelector("#profilePreview");
const fileInput = document.querySelector("#profilePhoto");
const logout = document.querySelector("#logout");

async function init() {
  const room = await getRoom(roomId);
  if (!room) return;
  if (form?.displayName) form.displayName.value = room.displayName || "";
  if (preview && room.profilePhoto) preview.src = room.profilePhoto;
}

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file && preview) preview.src = URL.createObjectURL(file);
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
