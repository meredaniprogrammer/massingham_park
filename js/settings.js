import { getRoom, nav, requireRoomSession, toast, updateRoom } from "./firebase.js";

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

function profilePhotoDataUrl(file, maxSize = 520, quality = 0.72) {
  if (!file || !file.type.startsWith("image/")) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not prepare image for upload."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not prepare image for saving."));
        reader.readAsDataURL(blob);
      }, "image/jpeg", quality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read this image."));
    };
    image.src = objectUrl;
  });
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
    if (file) button.textContent = "Preparing photo...";
    const photoUrl = file ? await profilePhotoDataUrl(file) : "";
    button.textContent = "Saving...";
    const update = { displayName: form.displayName.value.trim() };
    if (form.loginCode) update.loginCode = form.loginCode.value.trim().toUpperCase();
    if (photoUrl) update.profilePhoto = photoUrl;
    await updateRoom(roomId, update);
    toast("Profile saved.");
    if (location.pathname.endsWith("setup.html")) setTimeout(() => location.href = "dashboard.html", 500);
  } catch (error) {
    console.error(error);
    toast(error?.message || "Could not save settings.");
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
