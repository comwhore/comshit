// ==UserScript==
// @name         Instagram Dumper
// @namespace    comshit.instagram.tools
// @version      2.1.0
// @description  Dump following, followers, and common users to CSV (no scrolling).
// @match        https://www.instagram.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const BTN_ID = "tm-instagram-dump-btn";
  const STATUS_ID = "tm-instagram-dump-status";
  const STOP_ID = "tm-instagram-stop-btn";

  let stopRequested = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  async function humanPauseBetweenPages() {
    const base = ((Math.random() + Math.random()) / 2) * (920 - 320) + 320;
    const stumble = Math.random() < 0.07 ? randomBetween(650, 3400) : 0;
    const jitter = randomBetween(-55, 140);
    await sleep(Math.max(200, Math.round(base + stumble + jitter)));
  }

  /** Shorter pause when switching task (e.g. followers → following). */
  async function humanPauseBetweenPhases() {
    const base = ((Math.random() + Math.random()) / 2) * (1300 - 380) + 380;
    const tabSwitch = Math.random() < 0.11 ? randomBetween(450, 2200) : 0;
    await sleep(Math.max(250, Math.round(base + tabSwitch)));
  }

  function getContext() {
    const match = window.location.pathname.match(/^\/([^/?#]+)\/?$/);
    return { username: match?.[1] || null };
  }

  function ensureUI() {
    if (!document.getElementById(BTN_ID)) {
      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = "Dump Instagram CSV";
      btn.style.cssText = `
        position:fixed;right:16px;bottom:16px;z-index:999999;
        border:0;border-radius:999px;background:#0095f6;color:#fff;
        font-size:12px;padding:10px 14px;cursor:pointer;
      `;
      btn.onclick = run;
      document.body.appendChild(btn);
    }

    if (!document.getElementById(STATUS_ID)) {
      const s = document.createElement("div");
      s.id = STATUS_ID;
      s.style.cssText = `
        position:fixed;right:16px;bottom:60px;z-index:999999;
        background:#000;color:#fff;padding:8px 10px;border-radius:8px;
        font-size:12px;display:none;
      `;
      document.body.appendChild(s);
    }

    if (!document.getElementById(STOP_ID)) {
      const stop = document.createElement("button");
      stop.id = STOP_ID;
      stop.textContent = "Stop";
      stop.style.cssText = `
        position:fixed;right:16px;bottom:100px;z-index:999999;
        background:#c62828;color:#fff;border:0;border-radius:999px;
        padding:8px 12px;display:none;cursor:pointer;
      `;
      stop.onclick = () => {
        stopRequested = true;
        setStatus("Stopping...");
      };
      document.body.appendChild(stop);
    }
  }

  function setStatus(text, visible = true) {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = text;
    el.style.display = visible ? "block" : "none";
  }

  function setStopVisible(v) {
    const el = document.getElementById(STOP_ID);
    if (el) el.style.display = v ? "block" : "none";
  }

  function setButtonState(text, disabled) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.textContent = text;
    btn.disabled = !!disabled;
  }

  async function getUserId(username) {
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
      {
        credentials: "include",
        headers: {
          "x-ig-app-id": "936619743392459",
          "x-requested-with": "XMLHttpRequest"
        }
      }
    );
  
    if (!res.ok) {
      console.error("User info failed:", res.status);
      return null;
    }
  
    const data = await res.json();
    return data?.data?.user?.id || null;
  }

  async function fetchList(userId, kind) {
    const out = [];
    let maxId = null;

    while (true) {
      if (stopRequested) return null;

      const url = new URL(
        `/api/v1/friendships/${userId}/${kind}/`,
        location.origin
      );
      if (maxId) url.searchParams.set("max_id", maxId);

      const res = await fetch(url, {
        credentials: "include",
        headers: {
          "x-ig-app-id": "936619743392459",
          "x-requested-with": "XMLHttpRequest"
        }
      });

      if (!res.ok) break;

      const data = await res.json();

      for (const u of data.users || []) {
        out.push({
          displayName: u.full_name || u.username,
          username: u.username,
          profileLink: `https://www.instagram.com/${u.username}/`
        });
      }

      setStatus(`Fetching ${kind}: ${out.length}`);

      if (!data.next_max_id) break;
      maxId = data.next_max_id;

      await humanPauseBetweenPages();
    }

    return out;
  }

  function buildInCommon(following, followers) {
    const set = new Set(followers.map((u) => u.username.toLowerCase()));
    return following.filter((u) => set.has(u.username.toLowerCase()));
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  }

  function downloadCsv(username, following, followers, common) {
    const header = [
      "FOLLOWING", "Display name", "Username", "Profile link",
      "FOLLOWERS", "Display name", "Username", "Profile link",
      "IN COMMON", "Display name", "Username", "Profile link"
    ];

    const rows = [header];
    const max = Math.max(following.length, followers.length, common.length);

    for (let i = 0; i < max; i++) {
      const row = new Array(12).fill("");

      const a = following[i];
      if (a) {
        row[1] = a.displayName;
        row[2] = a.username;
        row[3] = a.profileLink;
      }

      const b = followers[i];
      if (b) {
        row[5] = b.displayName;
        row[6] = b.username;
        row[7] = b.profileLink;
      }

      const c = common[i];
      if (c) {
        row[9] = c.displayName;
        row[10] = c.username;
        row[11] = c.profileLink;
      }

      rows.push(row);
    }

    const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${username} instagram.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function run() {
    const ctx = getContext();
    if (!ctx.username) {
      setStatus("Open a profile first.");
      return;
    }

    stopRequested = false;
    setButtonState("Running...", true);
    setStopVisible(true);

    const userId = await getUserId(ctx.username);
    if (!userId) {
      setStatus("Failed to get user ID.");
      return;
    }

    await humanPauseBetweenPhases();

    const followers = await fetchList(userId, "followers");
    if (!followers) return;

    await humanPauseBetweenPhases();

    const following = await fetchList(userId, "following");
    if (!following) return;

    const common = buildInCommon(following, followers);

    downloadCsv(ctx.username, following, followers, common);

    setStatus(`Done: following ${following.length}, followers ${followers.length}, common ${common.length}`);
    setButtonState("Dump Instagram CSV", false);
    setStopVisible(false);
  }

  function init() {
    ensureUI();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();