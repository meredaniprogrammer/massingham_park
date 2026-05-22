import { toast, validateAdmin, validateRoomCode } from "./firebase.js";

const roomForm = document.querySelector("#roomLoginForm");
const adminForm = document.querySelector("#adminLoginForm");

roomForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = roomForm.querySelector("button");
  button.disabled = true;
  button.textContent = "Checking...";
  try {
    const code = roomForm.roomCode.value.trim().toUpperCase();
    const room = await validateRoomCode(code);
    if (!room) {
      toast("Room code not recognised.");
      return;
    }
    localStorage.setItem("homeharmony_room_doc_id", room.id);
    localStorage.setItem("homeharmony_room_name", room.roomName);
    location.href = room.displayName ? "dashboard.html" : "setup.html";
  } catch (error) {
    console.error(error);
    toast("Could not validate this room right now.");
  } finally {
    button.disabled = false;
    button.textContent = "Continue";
  }
});

adminForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = adminForm.querySelector("button");
  button.disabled = true;
  button.textContent = "Checking...";
  try {
    const ok = await validateAdmin(adminForm.adminId.value.trim(), adminForm.adminPin.value.trim());
    if (!ok) {
      toast("Admin details do not match.");
      return;
    }
    localStorage.setItem("homeharmony_admin", "true");
    location.href = "admin-dashboard.html";
  } catch (error) {
    console.error(error);
    toast("Could not validate admin access right now.");
  } finally {
    button.disabled = false;
    button.textContent = "Login";
  }
});
