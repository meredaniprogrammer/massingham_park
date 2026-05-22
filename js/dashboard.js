import {
  createHistory, formatDate, getRoom, nav, requireRoomSession, saveSettings,
  subscribeHistory, subscribeNotices, subscribeRooms, subscribeSettings, toast, updateRoom
} from "./firebase.js";

const roomId = localStorage.getItem("homeharmony_admin") === "true" && location.pathname.endsWith("history.html")
  ? null
  : requireRoomSession();

nav(localStorage.getItem("homeharmony_admin") === "true" ? "admin" : "user");

let currentRoom;
let rooms = [];
let settings = {};

function avatarSrc(room) {
  return room?.profilePhoto || "assets/images/avatar.svg";
}

function roomLabel(roomName) {
  const room = rooms.find((item) => item.roomName === roomName);
  return room?.displayName || roomName || "Room";
}

function greetingName() {
  return currentRoom?.displayName || currentRoom?.roomName || "there";
}

async function loadCurrentRoom() {
  if (!roomId) return;
  currentRoom = await getRoom(roomId);
  if (currentRoom && !currentRoom.displayName) location.href = "setup.html";
  const avatar = document.querySelector("#topAvatar");
  if (avatar) avatar.src = avatarSrc(currentRoom);
}

function renderDashboard() {
  const greeting = document.querySelector("#greeting");
  if (!greeting) return;
  greeting.textContent = `Good morning, ${greetingName()} ☀️`;
  document.querySelector("#currentResponsibility").textContent =
    settings.currentRoom ? (settings.currentRoom === currentRoom?.roomName ? "It's your turn!" : `${roomLabel(settings.currentRoom)} is responsible`) : "Not configured yet";
  document.querySelector("#nextRoom").textContent = settings.nextRoom ? roomLabel(settings.nextRoom) : "Not configured";
  document.querySelector("#recyclingDay").textContent = settings.recyclingDay || "Not configured";
  document.querySelector("#generalWasteDay").textContent = settings.generalWasteDay || "Not configured";
  document.querySelector("#gardenWasteDay").textContent = settings.gardenWasteDay || "Not configured";
  document.querySelector("#weeklyReminder").textContent = settings.updateDay ? `Bins rotate every ${settings.updateDay}.` : "Set a weekly update day in admin.";
}

function renderSchedule() {
  const grid = document.querySelector("#calendarGrid");
  if (!grid) return;
  document.querySelector("#scheduleRecycling").textContent = settings.recyclingDay || "Not configured";
  document.querySelector("#scheduleGeneral").textContent = settings.generalWasteDay || "Not configured";
  document.querySelector("#scheduleGarden").textContent = settings.gardenWasteDay || "Not configured";
  const today = new Date();
  document.querySelector("#calendarMonth").textContent = today.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dates = Array.from({ length: 35 }, (_, index) => index + 1);
  grid.innerHTML = days.map((day) => `<div class="date-cell day-name">${day}</div>`).join("") +
    dates.map((date) => `<div class="date-cell ${date === today.getDate() ? "active" : ""}">${date}</div>`).join("");
  const list = document.querySelector("#rotationList");
  list.innerHTML = rooms.map((room, index) => `
    <div class="timeline-row">
      <img class="avatar" src="${avatarSrc(room)}" alt="">
      <div><strong>${room.displayName || room.roomName}</strong><div class="meta">${room.roomName}</div></div>
      <span class="pill">${room.roomName === settings.currentRoom ? "This week" : index === 1 ? "Next" : `Week ${index + 1}`}</span>
    </div>
  `).join("") || `<div class="timeline-row"><div><strong>No rooms configured</strong><div class="meta">Add rooms in Firestore to build the rotation.</div></div></div>`;
}

function renderHistory(items) {
  const list = document.querySelector("#historyList");
  if (!list) return;
  list.innerHTML = items.map((item) => `
    <article class="activity-item reveal">
      <span class="avatar mini">${(item.roomId || "H").slice(-1)}</span>
      <div><strong>${item.action}</strong><div class="meta">${formatDate(item.createdAt)}</div></div>
      <span class="status">${item.action.includes("not available") ? "!" : "✓"}</span>
    </article>
  `).join("");
}

function renderLatestNotice(items) {
  const title = document.querySelector("#latestNoticeTitle");
  if (!title) return;
  const latest = items[0];
  title.textContent = latest?.title || "No notices yet";
  document.querySelector("#latestNoticeText").textContent = latest?.message || "Everything is quiet.";
}

function nextPair() {
  const ordered = [...rooms].sort((a, b) => a.turnOrder - b.turnOrder);
  if (!ordered.length) return { next: null, after: null };
  const currentIndex = Math.max(0, ordered.findIndex((room) => room.roomName === settings.currentRoom));
  const next = ordered[(currentIndex + 1) % ordered.length];
  const after = ordered[(currentIndex + 2) % ordered.length];
  return { next, after };
}

async function moveToNext(action) {
  const { next, after } = nextPair();
  if (!next || !after) {
    toast("No room rotation has been configured yet.");
    return;
  }
  await saveSettings({ currentRoom: next.roomName, nextRoom: after.roomName });
  await createHistory(action, currentRoom?.roomName || settings.currentRoom);
}

function bindTurnActions() {
  const title = document.querySelector("#turnTitle");
  if (title) title.textContent = settings.currentRoom ? (settings.currentRoom === currentRoom?.roomName ? `It's your turn, ${greetingName()}!` : `${roomLabel(settings.currentRoom)} has this turn`) : "No active turn configured";
  document.querySelector("#trashDate") && (document.querySelector("#trashDate").textContent = settings.generalWasteDay || "Not configured");
  document.querySelector("#completeTask")?.addEventListener("click", async () => {
    if (settings.currentRoom !== currentRoom?.roomName) return toast("This turn belongs to another room.");
    await moveToNext(`${greetingName()} completed the task`);
    toast("Nice, task completed.");
    setTimeout(() => location.href = "dashboard.html", 600);
  }, { once: true });
  document.querySelector("#unavailableTask")?.addEventListener("click", async () => {
    if (settings.currentRoom !== currentRoom?.roomName) return toast("This turn belongs to another room.");
    const reason = prompt("Reason for unavailability?");
    await updateRoom(roomId, { isAvailable: false, unavailableReason: reason || "Not available" });
    await moveToNext(`${greetingName()} was not available`);
    toast("Responsibility passed to the next room.");
    setTimeout(() => location.href = "dashboard.html", 600);
  }, { once: true });
}

async function init() {
  await loadCurrentRoom();
  subscribeRooms((data) => { rooms = data; renderSchedule(); renderDashboard(); bindTurnActions(); });
  subscribeSettings((data) => { settings = data || {}; renderDashboard(); renderSchedule(); bindTurnActions(); });
  subscribeNotices(renderLatestNotice);
  subscribeHistory(renderHistory);
}

init();
