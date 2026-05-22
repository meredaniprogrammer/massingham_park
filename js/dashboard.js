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
  const room = findRoom(roomName);
  return room?.displayName || roomName || "Room";
}

function normalizeRoomKey(value) {
  return String(value || "").trim().toLowerCase();
}

function roomMatches(room, value) {
  const key = normalizeRoomKey(value);
  return key && [
    room?.roomName,
    room?.displayName,
    room?.id,
    room?.turnOrder ? `Room ${room.turnOrder}` : "",
    room?.turnOrder
  ].some((candidate) => normalizeRoomKey(candidate) === key);
}

function loggedInRoomMatches(value) {
  return roomMatches(currentRoom, value) ||
    normalizeRoomKey(localStorage.getItem("homeharmony_room_name")) === normalizeRoomKey(value);
}

function findRoom(value) {
  return rooms.find((room) => roomMatches(room, value));
}

function roomIdentity(roomOrName) {
  if (typeof roomOrName === "object" && roomOrName) return roomOrName.id || roomOrName.roomName || roomOrName.displayName || "";
  return findRoom(roomOrName)?.id || roomOrName || "";
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
  if (value?.toDate) {
    const timestampDate = value.toDate();
    timestampDate.setHours(0, 0, 0, 0);
    return timestampDate;
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "none") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const monthNames = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
    september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };
  const textDate = normalized.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)/);
  if (textDate && monthNames[textDate[2]] !== undefined) {
    const today = startOfToday();
    const parsed = new Date(today.getFullYear(), monthNames[textDate[2]], Number(textDate[1]));
    if (parsed < today) parsed.setFullYear(parsed.getFullYear() + 1);
    return parsed;
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
  const upcoming = items
    .map((item) => ({ ...item, date: dateFromScheduleValue(item.value) }))
    .filter((item) => item.date && item.date >= today)
    .sort((a, b) => a.date - b.date);

  const grouped = new Map();
  upcoming.forEach((item) => {
    const key = [
      item.date.getFullYear(),
      String(item.date.getMonth() + 1).padStart(2, "0"),
      String(item.date.getDate()).padStart(2, "0")
    ].join("-");
    const existing = grouped.get(key) || { date: item.date, types: [] };
    existing.types.push(item.type);
    grouped.set(key, existing);
  });

  return [...grouped.values()].sort((a, b) => a.date - b.date);
}

function turnCollectionInfo(roomName) {
  const targetRoomName = roomIdentity(roomName);
  const currentResponsibleRoom = roomIdentity(settings.currentRoom);
  if (!targetRoomName) return null;
  const schedule = collectionSchedule();
  if (!schedule.length) return null;
  const ordered = assignmentOrder();
  if (!ordered.length) return schedule[0];
  const roomIndex = ordered.findIndex((room) => roomMatches(room, targetRoomName));
  if (roomIndex === -1) return schedule[0];
  const scheduleOffset = roomIndex;
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

function collectionLabel(info) {
  if (!info) return "No collection date";
  return `${info.types.join(" + ")} · ${formatCollectionDate(info.date)}`;
}

function loggedInRoomTurnInfo() {
  return turnCollectionInfo(currentRoom?.roomName || currentRoom?.displayName || currentRoom?.id);
}

function assignmentOrder() {
  const ordered = [...rooms].sort((a, b) => a.turnOrder - b.turnOrder);
  if (!ordered.length) return [];
  const current = findRoom(settings.currentRoom) || ordered[0];
  const next = findRoom(settings.nextRoom);
  const result = [];
  if (current) result.push(current);
  if (next && !result.some((room) => room.id === next.id)) result.push(next);

  const anchor = next || current;
  const anchorIndex = Math.max(0, ordered.findIndex((room) => room.id === anchor?.id));
  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const room = ordered[(anchorIndex + offset) % ordered.length];
    if (room && !result.some((item) => item.id === room.id)) result.push(room);
  }
  return result;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function taskInfo(type, value) {
  const date = dateFromScheduleValue(value);
  if (!type || !date) return null;
  return { type, date };
}

function assignedTurnInfo(room) {
  const isLoggedInRoom = room === currentRoom;
  if (roomMatches(room, settings.currentRoom) || (isLoggedInRoom && loggedInRoomMatches(settings.currentRoom))) {
    return taskInfo(
      firstValue(settings.currentTrashType, settings.trashType, settings.currentWasteType, settings.wasteType),
      firstValue(settings.currentTrashDate, settings.trashDate, settings.currentWasteDate, settings.wasteDate)
    ) || turnCollectionInfo(roomIdentity(room));
  }
  if (roomMatches(room, settings.nextRoom) || (isLoggedInRoom && loggedInRoomMatches(settings.nextRoom))) {
    return taskInfo(
      firstValue(settings.nextTrashType, settings.nextWasteType),
      firstValue(settings.nextTrashDate, settings.nextWasteDate)
    ) || turnCollectionInfo(roomIdentity(room));
  }
  return turnCollectionInfo(roomIdentity(room));
}

function collectionLabelForTask(info) {
  if (!info) return "No collection date";
  const label = info.types?.join(" + ") || info.type || "Trash";
  return `${label} · ${formatCollectionDate(info.date)}`;
}

function myTurnInfo() {
  return assignedTurnInfo(currentRoom);
}

function configuredAssignments() {
  return [
    {
      key: "current",
      label: "Current",
      room: findRoom(settings.currentRoom),
      info: taskInfo(settings.currentTrashType, settings.currentTrashDate)
    },
    {
      key: "next",
      label: "Next",
      room: findRoom(settings.nextRoom),
      info: taskInfo(settings.nextTrashType, settings.nextTrashDate)
    }
  ].filter((item) => item.room && item.info);
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

function currentWeekBounds() {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setDate(now.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatIfThisWeek(value) {
  const date = dateFromScheduleValue(value);
  if (!date) return "None this week";
  const { start, end } = currentWeekBounds();
  return date >= start && date <= end ? formatCollectionDate(date) : "None this week";
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

  const isMyTurn = settings.currentRoom && loggedInRoomMatches(settings.currentRoom);
  const nextRoomData = findRoom(settings.nextRoom);

  greeting.textContent = `${timeGreeting()}, ${greetingName()}!`;
  document.querySelector("#encouragementTitle") && (document.querySelector("#encouragementTitle").textContent = `Keep it up, ${greetingName()}!`);
  document.querySelector("#currentResponsibility").textContent = settings.currentRoom
    ? (isMyTurn ? "It's your turn!" : `${roomLabel(settings.currentRoom)} is responsible`)
    : "Not configured yet";
  document.querySelector("#taskMessage") && (document.querySelector("#taskMessage").textContent = isMyTurn
    ? "You’re responsible for taking out the trash."
    : "Check the weekly rotation for the current room.");

  document.querySelector("#nextRoom") && (document.querySelector("#nextRoom").textContent = settings.nextRoom ? roomLabel(settings.nextRoom) : "Not configured");
  document.querySelector("#nextRoomName") && (document.querySelector("#nextRoomName").textContent = settings.nextRoom ? roomLabel(settings.nextRoom) : "Not configured");
  document.querySelector("#nextRoomPerson") && (document.querySelector("#nextRoomPerson").textContent = roomLabel(settings.nextRoom));
  document.querySelector("#nextRoomAvatar") && (document.querySelector("#nextRoomAvatar").src = avatarSrc(nextRoomData));
  const nextCollection = assignedTurnInfo(nextRoomData || settings.nextRoom);
  document.querySelector("#nextRoomDates") && (document.querySelector("#nextRoomDates").textContent = collectionLabelForTask(nextCollection));

  const recyclingValue = settings.recyclingDate || settings.recyclingDay;
  const generalWasteValue = settings.generalWasteDate || settings.generalWasteDay;
  const gardenWasteValue = settings.gardenWasteDate || settings.gardenWasteDay;

  document.querySelector("#recyclingDay") && (document.querySelector("#recyclingDay").textContent = recyclingValue ? nextDateForDay(recyclingValue) : "Not configured");
  document.querySelector("#generalWasteDay") && (document.querySelector("#generalWasteDay").textContent = generalWasteValue ? nextDateForDay(generalWasteValue) : "Not configured");
  document.querySelector("#gardenWasteDay") && (document.querySelector("#gardenWasteDay").textContent = gardenWasteValue ? nextDateForDay(gardenWasteValue) : "Not configured");
  document.querySelector("#weeklyReminder") && (document.querySelector("#weeklyReminder").textContent = settings.updateDay && settings.updateDay !== "None" ? `Bins rotate every ${nextDateForDay(settings.updateDay)}.` : "Set a weekly update day in admin.");

  document.querySelector("#overviewRecycling") && (document.querySelector("#overviewRecycling").textContent = formatIfThisWeek(recyclingValue));
  document.querySelector("#overviewGeneral") && (document.querySelector("#overviewGeneral").textContent = formatIfThisWeek(generalWasteValue));
  document.querySelector("#overviewGarden") && (document.querySelector("#overviewGarden").textContent = formatIfThisWeek(gardenWasteValue));
  document.querySelector("#overviewUpdate") && (document.querySelector("#overviewUpdate").textContent = formatIfThisWeek(settings.updateDate || settings.updateDay));
  document.querySelector("#weekRange") && (document.querySelector("#weekRange").textContent = weekRangeText());

  renderDashboardRotation();
}

function renderDashboardRotation() {
  const target = document.querySelector("#dashboardRotation");
  if (!target) return;
  const assignments = configuredAssignments();
  target.innerHTML = assignments.map((assignment) => `
    <div class="rotation-bubble ${assignment.key === "current" ? "active" : ""}">
      <div><span>H</span></div>
      <strong>${escapeHtml(assignment.room.displayName || assignment.room.roomName || "Room")}</strong>
      <small>${escapeHtml(assignment.room.roomName || "")}</small>
      <small>${collectionLabelForTask(assignment.info)}</small>
    </div>
  `).join("") || `<div class="empty-card">Assign room, trash type and date in admin to build the rotation.</div>`;
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
  const assignments = configuredAssignments();
  list.innerHTML = assignments.map((assignment) => `
    <div class="timeline-row">
      <img class="avatar" src="${avatarSrc(assignment.room)}" alt="">
      <div><strong>${escapeHtml(assignment.room.displayName || assignment.room.roomName)}</strong><div class="meta">${collectionLabelForTask(assignment.info)}</div></div>
      <span class="pill">${assignment.label}</span>
    </div>
  `).join("") || `<div class="timeline-row"><div><strong>No assignments configured</strong><div class="meta">Assign room, trash type and date in admin.</div></div></div>`;
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
  const currentIndex = Math.max(0, ordered.findIndex((room) => roomMatches(room, settings.currentRoom)));
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
  await saveSettings({
    currentRoom: next.id,
    currentTrashType: settings.nextTrashType || settings.currentTrashType || "General waste",
    currentTrashDate: settings.nextTrashDate || settings.currentTrashDate || "",
    nextRoom: after.id,
    nextTrashType: "",
    nextTrashDate: ""
  });
  await createHistory(action, roomIdentity(currentRoom) || settings.currentRoom);
}

function bindTurnActions() {
  const title = document.querySelector("#turnTitle");
  const isMyTurn = settings.currentRoom && roomMatches(currentRoom, settings.currentRoom);
  if (title) title.textContent = settings.currentRoom
    ? (isMyTurn ? `It's your turn, ${greetingName()}!` : `Your next turn, ${greetingName()}`)
    : "No active turn configured";
  const userCollection = myTurnInfo();
  document.querySelector("#trashDate") && (document.querySelector("#trashDate").textContent = userCollection ? collectionLabelForTask(userCollection) : "Not configured");
  document.querySelector("#trashReminder") && (document.querySelector("#trashReminder").textContent = reminderTextForDate(userCollection?.date));
  const completeButton = document.querySelector("#completeTask");
  const unavailableButton = document.querySelector("#unavailableTask");
  if (completeButton) completeButton.disabled = !isMyTurn;
  if (unavailableButton) unavailableButton.disabled = !isMyTurn;
  if (completeButton && !isMyTurn) completeButton.textContent = "Not your active turn yet";
  if (unavailableButton && !isMyTurn) unavailableButton.textContent = "Only active on your turn";
  document.querySelector("#completeTask")?.addEventListener("click", async () => {
    if (!loggedInRoomMatches(settings.currentRoom)) return toast("This turn belongs to another room.");
    await moveToNext(`${greetingName()} completed the task`);
    toast("Nice, task completed.");
    setTimeout(() => location.href = "dashboard.html", 600);
  }, { once: true });
  document.querySelector("#unavailableTask")?.addEventListener("click", async () => {
    if (!loggedInRoomMatches(settings.currentRoom)) return toast("This turn belongs to another room.");
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
  subscribeSettings((data) => {
    settings = data || {};
    console.log("HomeHarmony waste settings", settings);
    renderDashboard();
    renderSchedule();
    bindTurnActions();
  });
  subscribeNotices(renderLatestNotice);
  subscribeHistory(renderHistory);
}

init();
