import { createNotice, formatDate, nav, requireAdminSession, requireRoomSession, subscribeNotices, toast } from "./firebase.js";

const isAdminPage = location.pathname.endsWith("notice-management.html");
if (isAdminPage) requireAdminSession();
if (!isAdminPage) requireRoomSession();
nav(isAdminPage ? "admin" : "user");

const noticeList = document.querySelector("#noticeList");
const form = document.querySelector("#noticeForm");
const images = ["living-room.svg", "login-illustration.svg", "trash-day.svg"];

function renderNotices(items) {
  if (!noticeList) return;
  noticeList.innerHTML = items.map((notice, index) => `
    <article class="notice-card reveal">
      <img src="assets/images/${images[index % images.length]}" alt="">
      <div class="notice-body">
        <h3>${notice.title}</h3>
        <p>${notice.message}</p>
        <div class="meta">${notice.createdBy || "Admin"} · ${formatDate(notice.createdAt)}</div>
      </div>
      <span>›</span>
    </article>
  `).join("");
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  button.textContent = "Publishing...";
  try {
    await createNotice({
      title: form.noticeTitle.value.trim(),
      message: form.noticeMessage.value.trim(),
      createdBy: "Admin"
    });
    form.reset();
    toast("Notice published.");
  } catch (error) {
    console.error(error);
    toast("Could not publish notice.");
  } finally {
    button.disabled = false;
    button.textContent = "Publish Notice";
  }
});

subscribeNotices(renderNotices);
