import {
  createHistory, formatDate, getRoom, nav, requireRoomSession, saveSettings,
  subscribeHistory, subscribeNotices, subscribeRooms, subscribeSettings, toast, updateRoom
} from "./firebase.js";

const roomId = requireRoomSession();

nav("user");

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

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 16) return "Good afternoon";
  return "Good evening";
}

function nextDateForDay(dayName) {
  const normalized = String(dayName || "").trim().toLowerCase();
  if (!normalized || normalized === "none") return "None";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
  }
  const dayIndex = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(normalized);
  if (dayIndex === -1) return dayName || "Not configured";
  const date = new Date();
  const diff = (dayIndex - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function dateFromScheduleValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "none") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const dayIndex = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(normalized);
  if (dayIndex === -1) return null;
  const date = new Date();
  const diff = (dayIndex - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return date;
}

function formatCollectionDate(date) {
  if (!date) return "None";
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function collectionSchedule() {
  const items = [
    { type: "Recycling", value: settings.recyclingDate || settings.recyclingDay },
    { type: "General waste", value: settings.generalWasteDate || settings.generalWasteDay },
    { type: "Garden waste", value: settings.gardenWasteDate || settings.gardenWasteDay }
  ];
  const today = startOfToday();
  return items
    .map((item) => ({ ...item, date: dateFromScheduleValue(item.value) }))
    .filter((item) => item.date && item.date >= today)
    .sort((a, b) => a.date - b.date);
}

function turnCollectionInfo(roomName) {
  if (!roomName) return null;
  const schedule = collectionSchedule();
  if (!schedule.length) return null;
  const ordered = [...rooms].sort((a, b) => a.turnOrder - b.turnOrder);
  if (!ordered.length) return schedule[0];
  const currentIndex = Math.max(0, ordered.findIndex((room) => room.roomName === settings.currentRoom));
  const roomIndex = ordered.findIndex((room) => room.roomName === roomName);
  if (roomIndex === -1) return schedule[0];
  const scheduleOffset = (roomIndex - currentIndex + ordered.length) % ordered.length;
  if (schedule[scheduleOffset]) return schedule[scheduleOffset];
  const lastKnown = schedule[schedule.length - 1];
  return {
    ...lastKnown,
    date: addDays(lastKnown.date, 7 * (scheduleOffset - schedule.length + 1))
  };
}

function turnCollectionDate(roomName) {
  return turnCollectionInfo(roomName)?.date || null;
}

function reminderTextForDate(collectionDate) {
  if (!collectionDate) return "Set a collection date in admin.";
  return `Put the bin out on ${formatCollectionDate(addDays(collectionDate, -1))} night.`;
}

function weekRangeText(offset = 0) {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1 + (offset * 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${format(monday)} - ${format(sunday)}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

async function loadCurrentRoom() {
  currentRoom = await getRoom(roomId);
  if (currentRoom && !currentRoom.displayName) location.href = "setup.html";
  const avatar = document.querySelector("#topAvatar");
  if (avatar) avatar.src = avatarSrc(currentRoom);
}

function renderDashboard() {
  const greeting = document.querySelector("#greeting");
  if (!greeting) return;

  const isMyTurn = settings.currentRoom && settings.currentRoom === currentRoom?.roomName;
  const nextRoomData = rooms.find((room) => room.roomName === settings.nextRoom);

  greeting.textContent = `${timeGreeting()}, ${greetingName()}!`;
  document.querySelector("#encouragementTitle") && (document.querySelector("#encouragementTitle").textContent = `Keep it up, ${greetingName()}!`);
  document.querySelector("#currentResponsibility").textContent = settings.currentRoom
    ? (isMyTurn ? "It's your turn!" : `${roomLabel(settings.currentRoom)} is responsible`)
    : "Not configured yet";
  document.querySelector("#taskMessage") && (document.querySelector("#taskMessage").textContent = isMyTurn
    ? "You’re responsible for taking out the trash."
    : "Check the weekly rotation for the current room.");

  document.querySelector("#nextRoom") && (document.querySelector("#nextRoom").textContent = settings.nextRoom ? roomLabel(settings.nextRoom) : "Not configured");
  document.querySelector("#nextRoomName") && (document.querySelector("#nextRoomName").textContent = settings.nextRoom || "Not configured");
  document.querySelector("#nextRoomPerson") && (document.querySelector("#nextRoomPerson").textContent = roomLabel(settings.nextRoom));
  document.querySelector("#nextRoomAvatar") && (document.querySelector("#nextRoomAvatar").src = avatarSrc(nextRoomData));
  const nextCollection = turnCollectionInfo(settings.nextRoom);
  document.querySelector("#nextRoomDates") && (document.querySelector("#nextRoomDates").textContent = nextCollection ? `${nextCollection.type} · ${formatCollectionDate(nextCollection.date)}` : "No collection date");

  const recyclingValue = settings.recyclingDate || settings.recyclingDay;
  const generalWasteValue = settings.generalWasteDate || settings.generalWasteDay;
  const gardenWasteValue = settings.gardenWasteDate || settings.gardenWasteDay;

  document.querySelector("#recyclingDay") && (document.querySelector("#recyclingDay").textContent = recyclingValue ? nextDateForDay(recyclingValue) : "Not configured");
  document.querySelector("#generalWasteDay") && (document.querySelector("#generalWasteDay").textContent = generalWasteValue ? nextDateForDay(generalWasteValue) : "Not configured");
  document.querySelector("#gardenWasteDay") && (document.querySelector("#gardenWasteDay").textContent = gardenWasteValue ? nextDateForDay(gardenWasteValue) : "Not configured");
  document.querySelector("#weeklyReminder") && (document.querySelector("#weeklyReminder").textContent = settings.updateDay && settings.updateDay !== "None" ? `Bins rotate every ${nextDateForDay(settings.updateDay)}.` : "Set a weekly update day in admin.");

  document.querySelector("#overviewRecycling") && (document.querySelector("#overviewRecycling").textContent = recyclingValue ? nextDateForDay(recyclingValue) : "Not configured");
  document.querySelector("#overviewGeneral") && (document.querySelector("#overviewGeneral").textContent = generalWasteValue ? nextDateForDay(generalWasteValue) : "Not configured");
  document.querySelector("#overviewGarden") && (document.querySelector("#overviewGarden").textContent = gardenWasteValue ? nextDateForDay(gardenWasteValue) : "Not configured");
  document.querySelector("#overviewUpdate") && (document.querySelector("#overviewUpdate").textContent = settings.updateDay ? nextDateForDay(settings.updateDay) : "Not configured");
  document.querySelector("#weekRange") && (document.querySelector("#weekRange").textContent = weekRangeText());

  renderDashboardRotation();
}

function renderDashboardRotation() {
  const target = document.querySelector("#dashboardRotation");
  if (!target) return;
  const ordered = [...rooms].sort((a, b) => a.turnOrder - b.turnOrder);
  target.innerHTML = ordered.map((room, index) => `
    <div class="rotation-bubble ${room.roomName === settings.currentRoom ? "active" : ""}">
      <div><span>H</span></div>
      <strong>${escapeHtml(room.roomName || `Room ${index + 1}`)}</strong>
      <small>${(() => {
        const info = turnCollectionInfo(room.roomName);
        return info ? `${info.type} · ${formatCollectionDate(info.date)}` : "No collection date";
      })()}</small>
    </div>
  `).join("") || `<div class="empty-card">Add rooms in Firestore to build the rotation.</div>`;
}

function renderSchedule() {
  const grid = document.querySelector("#calendarGrid");
  if (!grid) return;
  const recyclingValue = settings.recyclingDate || settings.recyclingDay;
  const generalWasteValue = settings.generalWasteDate || settings.generalWasteDay;
  const gardenWasteValue = settings.gardenWasteDate || settings.gardenWasteDay;
  document.querySelector("#scheduleRecycling").textContent = recyclingValue ? nextDateForDay(recyclingValue) : "Not configured";
  document.querySelector("#scheduleGeneral").textContent = generalWasteValue ? nextDateForDay(generalWasteValue) : "Not configured";
  document.querySelector("#scheduleGarden").textContent = gardenWasteValue ? nextDateForDay(gardenWasteValue) : "Not configured";
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
      <div><strong>${escapeHtml(room.displayName || room.roomName)}</strong><div class="meta">${escapeHtml(room.roomName)}</div></div>
      <span class="pill">${room.roomName === settings.currentRoom ? "This week" : index === 1 ? "Next" : `Week ${index + 1}`}</span>
    </div>
  `).join("") || `<div class="timeline-row"><div><strong>No rooms configured</strong><div class="meta">Add rooms in Firestore to build the rotation.</div></div></div>`;
}

function renderHistory(items) {
  const list = document.querySelector("#historyList");
  if (list) list.innerHTML = items.map((item) => `
    <article class="activity-item reveal">
      <span class="avatar mini">${escapeHtml((item.roomId || "H").slice(-1))}</span>
      <div><strong>${escapeHtml(item.action || "House activity")}</strong><div class="meta">${formatDate(item.createdAt)}</div></div>
      <span class="status">${item.action?.includes("not available") ? "!" : "✓"}</span>
    </article>
  `).join("");

  const dashboardList = document.querySelector("#dashboardActivity");
  if (!dashboardList) return;
  dashboardList.innerHTML = items.slice(0, 3).map((item, index) => `
    <div class="activity-line">
      <span class="activity-dot dot-${index}">${item.action?.includes("notice") ? "!" : "✓"}</span>
      <div><strong>${escapeHtml(item.action || "House activity")}</strong><small>${formatDate(item.createdAt)}</small></div>
    </div>
  `).join("") || `<div class="empty-card">No recent activity yet.</div>`;
}

function renderLatestNotice(items) {
  const latest = items[0];
  document.querySelector("#latestNoticeTitle") && (document.querySelector("#latestNoticeTitle").textContent = latest?.title || "No notices yet");
  document.querySelector("#latestNoticeText") && (document.querySelector("#latestNoticeText").textContent = latest?.message || "Everything is quiet.");
  document.querySelector("#noticeCardTitle") && (document.querySelector("#noticeCardTitle").textContent = latest?.title || "No notices yet");
  document.querySelector("#noticeCardText") && (document.querySelector("#noticeCardText").textContent = latest?.message || "Everything is quiet.");
  document.querySelector("#latestNoticeMeta") && (document.querySelector("#latestNoticeMeta").textContent = latest ? `${latest.createdBy || "Admin"} · ${formatDate(latest.createdAt)}` : "HomeHarmony");
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
  const userCollection = turnCollectionInfo(currentRoom?.roomName);
  document.querySelector("#trashDate") && (document.querySelector("#trashDate").textContent = userCollection ? `${userCollection.type} · ${formatCollectionDate(userCollection.date)}` : "Not configured");
  document.querySelector("#trashReminder") && (document.querySelector("#trashReminder").textContent = reminderTextForDate(userCollection?.date));
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
