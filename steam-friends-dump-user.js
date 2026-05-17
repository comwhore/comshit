// ==UserScript==
// @name         Steam Dumper
// @namespace    comshit.steam.tools
// @version      1.0.0
// @description  Dump Steam friends to CSV
// @match        https://steamcommunity.com/*/friends*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const CARD_SELECTOR = ".friend_block_v2";
  const BTN_ID = "tm-steam-dump";
  const STATUS_ID = "tm-steam-status";
  const STOP_ID = "tm-steam-stop";
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

  function getUsers() {
    const users = [];
    const seen = new Set();

    document.querySelectorAll(CARD_SELECTOR).forEach(card => {
      const name = card.querySelector(".friend_block_content")?.childNodes[0]?.textContent.trim() || "";
      const url = card.querySelector(".selectable_overlay")?.href || "";

      if (!url || seen.has(url)) return;
      seen.add(url);

      users.push({ name, url });
    });

    return users;
  }
function getSteamUsername() {
  const el = document.querySelector(".friends_header_name a");
  if (el && el.textContent.trim()) {
    return el.textContent.trim();
  }

  const alt = document.querySelector(".actual_persona_name");
  if (alt && alt.textContent.trim()) {
    return alt.textContent.trim();
  }

  return "steam-user";
}
  async function scrollCollect() {
    let last = 0;
    let stable = 0;

    for (let i = 0; i < 100; i++) {
      if (stopRequested) return null;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(800);

      const count = document.querySelectorAll(CARD_SELECTOR).length;
      setStatus(`Collecting friends: ${count}`);

      if (count === last) stable++;
      else stable = 0;

      last = count;

      if (stable > 5) break;
    }

    return getUsers();
  }

  function download(users) {
  const rows = [["Name", "Profile"]];
  users.forEach(u => rows.push([u.name, u.url]));

  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);

  const name = getSteamUsername();
  a.download = `${name} steam.csv`;

  a.click();
}

  async function run() {
    stopRequested = false;
    setStopVisible(true);
    setStatus("Collecting friends...");
    const users = await scrollCollect();
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