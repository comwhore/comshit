// ==UserScript==
// @name         Roblox Friends Dumper
// @namespace    whereami.roblox.tools
// @version      1.0.0
// @description  Dump all Roblox friends to CSV
// @match        https://www.roblox.com/users/*/friends*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const CARD_SELECTOR = "li.list-item.avatar-card";
  const BTN_ID = "tm-roblox-dump";
  const STATUS_ID = "tm-roblox-status";
  const STOP_ID = "tm-roblox-stop";
  let stopRequested = false;

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function setStatus(message, visible = true) {
    let box = document.getElementById(STATUS_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = STATUS_ID;
      box.style.position = "fixed";
      box.style.right = "20px";
      box.style.bottom = "64px";
      box.style.zIndex = "2147483647";
      box.style.background = "rgba(0,0,0,0.85)";
      box.style.color = "#fff";
      box.style.padding = "8px 10px";
      box.style.borderRadius = "8px";
      box.style.fontSize = "12px";
      box.style.display = "none";
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.style.display = visible ? "block" : "none";
  }

  function setStopVisible(visible) {
    let stop = document.getElementById(STOP_ID);
    if (!stop) {
      stop = document.createElement("button");
      stop.id = STOP_ID;
      stop.textContent = "Stop";
      stop.style.position = "fixed";
      stop.style.right = "116px";
      stop.style.bottom = "20px";
      stop.style.zIndex = "2147483647";
      stop.style.border = "0";
      stop.style.borderRadius = "999px";
      stop.style.padding = "8px 12px";
      stop.style.fontSize = "12px";
      stop.style.fontWeight = "700";
      stop.style.color = "#fff";
      stop.style.background = "#c62828";
      stop.style.cursor = "pointer";
      stop.style.display = "none";
      stop.onclick = () => {
        stopRequested = true;
        setStatus("Stopping...");
      };
      document.body.appendChild(stop);
    }
    stop.style.display = visible ? "block" : "none";
  }

  function getRobloxUsername() {
  const el = document.querySelector(".friends-title");
  if (el && el.textContent.trim()) {
    const text = el.textContent.trim();

    const match = text.match(/^(.+?)'s Friends$/i);
    if (match) return match[1].trim();

    return text;
  }

  return "roblox-user";
}
  function getUsersFromPage() {
    const users = [];
    const seen = new Set();

    document.querySelectorAll(CARD_SELECTOR).forEach(card => {
      const name = card.querySelector(".avatar-name")?.textContent.trim() || "";
      const username = card.querySelector(".avatar-card-label")?.textContent.replace("@","").trim() || "";
      const link = card.querySelector("a.avatar-card-link")?.href || "";

      if (!link || seen.has(link)) return;
      seen.add(link);

      users.push({ name, username, link });
    });

    return users;
  }

  function getNextButton() {
    return document.querySelector(".pager-next button:not([disabled])");
  }

  async function collectAll() {
    const map = new Map();

    while (true) {
      if (stopRequested) return null;
      getUsersFromPage().forEach(u => {
        map.set(u.link, u);
      });
      setStatus(`Collecting friends: ${map.size}`);

      const next = getNextButton();
      if (!next) break;

      next.click();
      await sleep(1200);
    }

    return [...map.values()];
  }

  function download(users) {
  const rows = [["Name", "Username", "Profile"]];
  users.forEach(u => rows.push([u.name, u.username, u.link]));

  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);

  const name = getRobloxUsername();
  a.download = `${name} roblox.csv`;

  a.click();
}

  async function run() {
    stopRequested = false;
    setStopVisible(true);
    setStatus("Collecting friends...");
    const users = await collectAll();
    if (stopRequested || !users) {
      setStatus("Stopped.", true);
      setStopVisible(false);
      return;
    }
    download(users);
    setStatus(`Done: ${users.length}`, true);
    setStopVisible(false);
  }

  function init() {
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.textContent = "Dump Friends";
    btn.style.position = "fixed";
    btn.style.bottom = "20px";
    btn.style.right = "20px";
    btn.onclick = run;
    document.body.appendChild(btn);
    setStopVisible(false);
  }

  init();
})();