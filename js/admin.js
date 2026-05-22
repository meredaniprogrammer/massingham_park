import {
  createHistory, nav, requireAdminSession, saveSettings, subscribeRooms,
  subscribeSettings, toast, updateRoom
} from "./firebase.js";

requireAdminSession();
nav("admin");

const days = ["None", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const trashTypes = ["Recycling", "General waste", "Garden waste"];
let rooms = [];
let settings = {};

function roomDisplay(room) {
  if (!room) return "No room set";
  const name = room.displayName || "Not named";
  const roomName = room.roomName || `Room ${room.turnOrder || ""}`.trim() || room.id;
  return `${name} (${roomName})`;
}

function findRoom(value) {
  const key = String(value || "").trim().toLowerCase();
  return rooms.find((room) => [
    room.id,
    room.roomName,
    room.displayName,
    room.turnOrder ? `Room ${room.turnOrder}` : ""
  ].some((candidate) => String(candidate || "").trim().toLowerCase() === key));
}

function roomIdFor(value) {
  return findRoom(value)?.id || value || "";
}

function fillSelect(select, values, valueKey = null) {
  if (!select) return;
  select.innerHTML = values.map((item) => {
    const value = valueKey ? item[valueKey] : item;
    return `<option value="${value}">${value}</option>`;
  }).join("");
}

function populateAdminForm() {
  const dayIds = ["updateDayInput"];
  dayIds.forEach((id) => fillSelect(document.querySelector(`#${id}`), days));
  fillSelect(document.querySelector("#currentTrashTypeInput"), trashTypes);
  fillSelect(document.querySelector("#nextTrashTypeInput"), trashTypes);
  const currentRoomSelect = document.querySelector("#currentRoomInput");
  const nextRoomSelect = document.querySelector("#nextRoomInput");
  if (currentRoomSelect) {
    currentRoomSelect.innerHTML = rooms.map((r) => `<option value="${r.id}">${roomDisplay(r)}</option>`).join("");
  }
  if (nextRoomSelect) {
    nextRoomSelect.innerHTML = rooms.map((r) => `<option value="${r.id}">${roomDisplay(r)}</option>`).join("");
  }
  const map = {
    updateDayInput: settings.updateDay,
    currentRoomInput: roomIdFor(settings.currentRoom),
    currentTrashTypeInput: settings.currentTrashType,
    currentTrashDateInput: settings.currentTrashDate,
    nextRoomInput: roomIdFor(settings.nextRoom),
    nextTrashTypeInput: settings.nextTrashType,
    nextTrashDateInput: settings.nextTrashDate
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.querySelector(`#${id}`);
    if (el && value) el.value = value;
  });
  const overview = document.querySelector("#adminOverview");
  if (overview) {
    if (settings.currentRoom) {
      overview.textContent = `${roomDisplay(findRoom(settings.currentRoom))} is responsible. ${roomDisplay(findRoom(settings.nextRoom))} is next.`;
    } else {
      overview.textContent = "Configure rooms and waste settings to start.";
    }
  }
}

function renderRooms() {
  const list = document.querySelector("#roomManagementList");
  if (!list) return;
  list.innerHTML = rooms.map((room) => `
    <article class="room-card reveal">
      <img class="avatar" src="${room.profilePhoto || "assets/images/avatar.svg"}" alt="">
      <div>
        <strong>${room.roomName} — ${room.displayName || "Not set"}</strong>
        <div class="meta">${room.disabled ? "Disabled" : room.isAvailable === false ? "Unavailable" : "Enabled"} · ${room.loginCode || "Private code"}</div>
      </div>
      <div class="room-actions">
        <button data-action="name" data-id="${room.id}">Reset display name</button>
        <button data-action="photo" data-id="${room.id}">Reset profile photo</button>
        <button data-action="${room.disabled ? "enable" : "disable"}" data-id="${room.id}">${room.disabled ? "Enable room" : "Disable room"}</button>
      </div>
    </article>
  `).join("");
}

document.querySelector("#wasteSettingsForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const updateDayInput = document.querySelector("#updateDayInput");
  const currentRoomInput = document.querySelector("#currentRoomInput");
  const currentTrashTypeInput = document.querySelector("#currentTrashTypeInput");
  const currentTrashDateInput = document.querySelector("#currentTrashDateInput");
  const nextRoomInput = document.querySelector("#nextRoomInput");
  const nextTrashTypeInput = document.querySelector("#nextTrashTypeInput");
  const nextTrashDateInput = document.querySelector("#nextTrashDateInput");
  await saveSettings({
    updateDay: updateDayInput.value,
    currentRoom: currentRoomInput.value, // now stores room id
    currentTrashType: currentTrashTypeInput.value,
    currentTrashDate: currentTrashDateInput.value,
    nextRoom: nextRoomInput.value, // now stores room id
    nextTrashType: nextTrashTypeInput.value,
    nextTrashDate: nextTrashDateInput.value
  });
  await createHistory("Admin updated recycling and waste days", "Admin");
  toast("Waste settings saved.");
});

document.querySelector("#rotateTasks")?.addEventListener("click", async () => {
  const ordered = [...rooms].sort((a, b) => a.turnOrder - b.turnOrder);
  if (!ordered.length) {
    toast("No rooms are configured yet.");
    return;
  }
  const index = Math.max(0, ordered.findIndex((room) => room.id === settings.currentRoom));
  const next = ordered[(index + 1) % ordered.length];
  const after = ordered[(index + 2) % ordered.length];
  await saveSettings({
    currentRoom: next.id,
    currentTrashType: settings.nextTrashType || settings.currentTrashType || "General waste",
    currentTrashDate: settings.nextTrashDate || settings.currentTrashDate || "",
    nextRoom: after.id,
    nextTrashType: "",
    nextTrashDate: ""
  });
  await createHistory(`Admin rotated tasks to ${next.roomName}`, "Admin");
  toast("Tasks rotated.");
});

document.querySelector("#roomManagementList")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === "name") await updateRoom(id, { displayName: "" });
  if (action === "photo") await updateRoom(id, { profilePhoto: "" });
  if (action === "disable") await updateRoom(id, { disabled: true });
  if (action === "enable") await updateRoom(id, { disabled: false });
  await createHistory(`Admin updated ${rooms.find((room) => room.id === id)?.roomName || "a room"}`, "Admin");
  toast("Room updated.");
});

subscribeRooms((data) => { rooms = data; populateAdminForm(); renderRooms(); });
subscribeSettings((data) => { settings = data || {}; populateAdminForm(); });
