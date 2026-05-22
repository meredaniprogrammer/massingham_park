import { formatDate, nav, requireAdminSession, subscribeHistory } from "./firebase.js";

requireAdminSession();
nav("admin");

function renderHistory(items) {
  const list = document.querySelector("#historyList");
  if (!list) return;
  list.innerHTML = items.map((item) => `
    <article class="activity-item reveal">
      <span class="avatar mini">${(item.roomId || "H").slice(-1)}</span>
      <div><strong>${item.action}</strong><div class="meta">${formatDate(item.createdAt)}</div></div>
      <span class="status">${item.action.includes("not available") ? "!" : "✓"}</span>
    </article>
  `).join("") || `<article class="activity-item"><div><strong>No history yet</strong><div class="meta">Activity will appear here as tasks are updated.</div></div></article>`;
}

subscribeHistory(renderHistory);
