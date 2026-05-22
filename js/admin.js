import {
  createHistory, nav, requireAdminSession, saveSettings, subscribeRooms,
  subscribeSettings, toast, updateRoom
} from "./firebase.js";

requireAdminSession();
nav("admin");

const days = ["None", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let rooms = [];
let settings = {};

function fillSelect(select, values, valueKey = null) {
  if (!select) return;
  select.innerHTML = values.map((item) => {
    const value = valueKey ? item[valueKey] : item;
    return `<option value="${value}">${value}</option>`;
  }).join("");
}

function populateAdminForm() {
  const dayIds = ["recyclingDayInput", "generalWasteDayInput", "gardenWasteDayInput", "updateDayInput"];
  dayIds.forEach((id) => fillSelect(document.querySelector(`#${id}`), days));
  fillSelect(document.querySelector("#currentRoomInput"), rooms, "roomName");
  fillSelect(document.querySelector("#nextRoomInput"), rooms, "roomName");
  const map = {
    recyclingDayInput: settings.recyclingDay,
    generalWasteDayInput: settings.generalWasteDay,
    gardenWasteDayInput: settings.gardenWasteDay,
    updateDayInput: settings.updateDay,
    currentRoomInput: settings.currentRoom,
    nextRoomInput: settings.nextRoom
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.querySelector(`#${id}`);
    if (el && value) el.value = value;
  });
  const overview = document.querySelector("#adminOverview");
  if (overview) overview.textContent = settings.currentRoom ? `${settings.currentRoom} is responsible. ${settings.nextRoom || "No next room set"} is next.` : "Configure rooms and waste settings to start.";
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
  const recyclingDayInput = document.querySelector("#recyclingDayInput");
  const generalWasteDayInput = document.querySelector("#generalWasteDayInput");
  const gardenWasteDayInput = document.querySelector("#gardenWasteDayInput");
  const updateDayInput = document.querySelector("#updateDayInput");
  const currentRoomInput = document.querySelector("#currentRoomInput");
  const nextRoomInput = document.querySelector("#nextRoomInput");
  await saveSettings({
    recyclingDay: recyclingDayInput.value,
    generalWasteDay: generalWasteDayInput.value,
    gardenWasteDay: gardenWasteDayInput.value,
    updateDay: updateDayInput.value,
    currentRoom: currentRoomInput.value,
    nextRoom: nextRoomInput.value
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
  const index = Math.max(0, ordered.findIndex((room) => room.roomName === settings.currentRoom));
  const next = ordered[(index + 1) % ordered.length];
  const after = ordered[(index + 2) % ordered.length];
  await saveSettings({ currentRoom: next.roomName, nextRoom: after.roomName });
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
