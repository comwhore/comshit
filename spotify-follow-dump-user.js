// ==UserScript==
// @name         Spotify Followers/Following Dumper
// @namespace    whereami.spotify.tools
// @version      1.3.0
// @description  Dump followers, following, and common users for the viewed Spotify profile.
// @match        https://open.spotify.com/user/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STATE_KEY = "tm_spotify_dump_state_v2";
  const BTN_ID = "tm-spotify-dump-btn";
  const STATUS_ID = "tm-spotify-dump-status";
  const STOP_ID = "tm-spotify-stop-btn";
  let stopRequested = false;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function getContext() {
    const m = window.location.pathname.match(/^\/user\/([^/]+)(?:\/(followers|following))?/i);
    return {
      userId: m?.[1] || null,
      pageType: (m?.[2] || "profile").toLowerCase(),
    };
  }

  function getDisplayNameNow() {
  const el = document.querySelector("main h1[data-encore-id='text']");

  if (el && el.textContent.trim()) {
    return el.textContent.trim();
  }

  return null;
}

  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STATE_KEY));
    } catch {
      return null;
    }
  }

  function saveState(state) {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function clearState() {
    sessionStorage.removeItem(STATE_KEY);
  }

  function setStatus(text, visible = true) {
    let box = document.getElementById(STATUS_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = STATUS_ID;
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.style.display = visible ? "block" : "none";
  }

  function setStopVisible(visible) {
    let btn = document.getElementById(STOP_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = STOP_ID;
      btn.textContent = "Stop";
      btn.onclick = () => {
        stopRequested = true;
        setStatus("Stopping...");
      };
      document.body.appendChild(btn);
    }
    btn.style.display = visible ? "block" : "none";
  }

  function setButtonState(text, disabled) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.textContent = text;
    btn.disabled = !!disabled;
  }

  function ensureStyles() {
    if (document.getElementById("tm-spotify-dump-style")) return;
    const style = document.createElement("style");
    style.id = "tm-spotify-dump-style";
    style.textContent = `
      #${BTN_ID} { margin-left:8px; padding:2px 10px; border-radius:999px; height:24px; font-size:12px; font-weight:700; background:#1db954; color:#000; cursor:pointer; }
      #${STATUS_ID} { position:fixed; right:16px; bottom:56px; background:rgba(0,0,0,0.85); color:#fff; padding:8px; border-radius:8px; display:none; z-index:2147483647; }
      #${STOP_ID} { position:fixed; right:16px; bottom:16px; padding:6px 12px; border:0; border-radius:999px; background:#c62828; color:#fff; font-size:12px; font-weight:700; cursor:pointer; display:none; z-index:2147483647; }
    `;
    document.head.appendChild(style);
  }

  function findMetaRow() {
    const followers = document.querySelector('a[href*="/followers"]');
    const following = document.querySelector('a[href*="/following"]');
    if (!followers && !following) return null;

    let p = followers?.parentElement || following?.parentElement;
    while (p && p !== document.body) {
      if (p.querySelector('a[href*="/followers"]') && p.querySelector('a[href*="/following"]')) return p;
      p = p.parentElement;
    }
    return null;
  }

  function ensureButton() {
    ensureStyles();
    const existing = document.getElementById(BTN_ID);
    const metaRow = findMetaRow();

    if (!metaRow) {
      if (existing) existing.remove();
      return;
    }

    if (existing) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.textContent = "Dump CSV";
    btn.onclick = onDumpClick;
    metaRow.appendChild(btn);
  }

  function parseUsers() {
    const users = [];
    const seen = new Set();

    document.querySelectorAll('[data-testid="grid-container"] [data-encore-id="cardTitle"]').forEach(el => {
      const name = el.textContent.trim();
      const link = el.closest("a")?.href;
      if (!link || seen.has(link)) return;
      seen.add(link);
      users.push({ nickname: name, profileLink: link });
    });

    return users;
  }

  async function scrollCollect() {
    const map = new Map();
    let stable = 0;

    for (let i = 0; i < 200; i++) {
      if (stopRequested) return null;
      parseUsers().forEach(u => map.set(u.profileLink, u));

      window.scrollBy(0, window.innerHeight);
      await sleep(600);

      const size = map.size;
      if (i > 0 && size === prev) stable++;
      else stable = 0;

      var prev = size;
      setStatus(`Collected ${size}`);

      if (stable > 10) break;
    }

    return [...map.values()];
  }

  function downloadCsv(state, followers, following) {
    const rows = [["Followers", "Link", "Following", "Link"]];
    const max = Math.max(followers.length, following.length);

    for (let i = 0; i < max; i++) {
      rows.push([
        followers[i]?.nickname || "",
        followers[i]?.profileLink || "",
        following[i]?.nickname || "",
        following[i]?.profileLink || "",
      ]);
    }

    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);

    const name = state.displayName || state.userId || "spotify-user";
    a.download = `${name} spotify.csv`;

    a.click();
  }

  async function runOrResume() {
    const ctx = getContext();
    let state = loadState();

    if (!state) return;

    setButtonState("Running...", true);
    setStopVisible(true);

    if (!state.followers) {
      if (ctx.pageType !== "followers") {
        location.href = `/user/${ctx.userId}/followers`;
        return;
      }
      state.followers = await scrollCollect();
      if (stopRequested || !state.followers) {
        clearState();
        setButtonState("Dump CSV", false);
        setStatus("Stopped.", true);
        setStopVisible(false);
        return;
      }
      saveState(state);
      location.href = `/user/${ctx.userId}/following`;
      return;
    }

    if (!state.following) {
      if (ctx.pageType !== "following") {
        location.href = `/user/${ctx.userId}/following`;
        return;
      }
      state.following = await scrollCollect();
      if (stopRequested || !state.following) {
        clearState();
        setButtonState("Dump CSV", false);
        setStatus("Stopped.", true);
        setStopVisible(false);
        return;
      }
      saveState(state);
    }

    downloadCsv(state, state.followers, state.following);
    setStatus("Done!");
    clearState();
    setButtonState("Dump CSV", false);
    setStopVisible(false);
  }

  async function onDumpClick() {
    const ctx = getContext();
    stopRequested = false;

    const displayName = getDisplayNameNow();

    const state = {
      userId: ctx.userId,
      displayName,
      followers: null,
      following: null,
    };

    saveState(state);
    runOrResume();
  }

  function init() {
    ensureButton();
    setButtonState("Dump CSV", false);
    setStopVisible(false);

    const state = loadState();
    if (state) runOrResume();

    new MutationObserver(ensureButton).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();