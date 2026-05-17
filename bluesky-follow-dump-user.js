// ==UserScript==
// @name         Bluesky Dumper
// @namespace    comshit.bluesky.tools
// @version      1.1.2
// @description  Dump Bluesky following, followers, and common users to CSV.
// @match        https://bsky.app/profile/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STATE_KEY = "tm_bluesky_dump_state_v1";
  const BTN_ID = "tm-bluesky-dump-btn";
  const STATUS_ID = "tm-bluesky-dump-status";
  const STOP_ID = "tm-bluesky-stop-btn";
  let stopRequested = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function getContext() {
    const match = window.location.pathname.match(/^\/profile\/([^/]+)(?:\/(followers|follows))?/i);
    return {
      handle: match?.[1] || null,
      pageType: (match?.[2] || "profile").toLowerCase(),
    };
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

  function ensureStyles() {
    if (document.getElementById("tm-bluesky-dump-style")) return;

    const style = document.createElement("style");
    style.id = "tm-bluesky-dump-style";
    style.textContent = `
      #${BTN_ID} {
        margin-left: 8px;
        padding: 4px 10px;
        border: 0;
        border-radius: 999px;
        height: 28px;
        font-size: 12px;
        font-weight: 700;
        background: rgb(15, 115, 255);
        color: #fff;
        cursor: pointer;
      }

      #${BTN_ID}[disabled] {
        opacity: 0.65;
        cursor: default;
      }

      #${STATUS_ID} {
        position: fixed;
        right: 16px;
        bottom: 56px;
        z-index: 2147483647;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 12px;
        line-height: 1.4;
        display: none;
      }

      #${STOP_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        border: 0;
        border-radius: 999px;
        background: #c62828;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        padding: 7px 12px;
        cursor: pointer;
        display: none;
      }
    `;

    document.head.appendChild(style);
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
      btn.type = "button";
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

  function getDisplayNameNow() {
    const el = document.querySelector('[data-testid="profileHeaderDisplayName"]');
    if (el && el.textContent.trim()) return el.textContent.trim();

    const ctx = getContext();
    return ctx.handle || "bluesky-user";
  }

  function findMetaRow() {
    const followers = document.querySelector('a[data-testid="profileHeaderFollowersButton"]');
    const follows = document.querySelector('a[data-testid="profileHeaderFollowsButton"]');
    if (!followers || !follows) return null;

    let node = followers.parentElement;
    while (node && node !== document.body) {
      if (node.contains(follows)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function ensureButton() {
    ensureStyles();
    const row = findMetaRow();
    const existing = document.getElementById(BTN_ID);

    if (!row) {
      if (existing) existing.remove();
      return;
    }

    if (existing) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "Dump CSV";
    btn.addEventListener("click", onDumpClick);
    row.appendChild(btn);
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toAbsoluteUrl(href) {
    try {
      return new URL(href, window.location.origin).toString();
    } catch {
      return "";
    }
  }

  function extractHandle(card) {
    const texts = Array.from(card.querySelectorAll("div, span, p"))
      .map((el) => normalizeText(el.textContent))
      .filter(Boolean);

    for (const text of texts) {
      const match = text.match(/@([a-z0-9._-]+(?:\.bsky\.social)?)/i);
      if (match) return "@" + match[1].toLowerCase();
    }

    const href = card.getAttribute("href") || "";
    const hrefMatch = href.match(/^\/profile\/([^/?#]+)/i);
    if (hrefMatch) return "@" + hrefMatch[1].toLowerCase();

    return "";
  }

  function extractDisplayName(card, fallbackHandle) {
    const aria = normalizeText(card.getAttribute("aria-label"));
    const match = aria.match(/^View (.+?)['’]s profile$/i);
    if (match && match[1]) return match[1].trim();
    return fallbackHandle.replace(/^@/, "");
  }

  function parseAbbreviatedCount(text) {
    const raw = normalizeText(text).replace(/,/g, "").toUpperCase();
    const m = raw.match(/(\d+(?:\.\d+)?)([KMB])?/);
    if (!m) return 0;
    const base = Number(m[1]);
    if (!Number.isFinite(base)) return 0;
    const unit = m[2] || "";
    if (unit === "K") return Math.round(base * 1_000);
    if (unit === "M") return Math.round(base * 1_000_000);
    if (unit === "B") return Math.round(base * 1_000_000_000);
    return Math.round(base);
  }


  function sniffFollowingFollowerTotalsFromDom() {
    let following = 0;
    let followers = 0;

    const takeNum = (text) => {
      const t = normalizeText(text);
      const mf = t.match(/(\d[\d,]*)\s+following\b/i);
      if (mf) {
        const n = Number(mf[1].replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) following = Math.max(following, n);
      }
      const mfol = t.match(/(\d[\d,]*)\s+followers\b/i);
      if (mfol) {
        const n = Number(mfol[1].replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) followers = Math.max(followers, n);
      }
    };

    document.querySelectorAll('div[dir="auto"]').forEach((el) => takeNum(el.textContent || ""));

    const followsBtn = document.querySelector('a[data-testid="profileHeaderFollowsButton"]');
    if (followsBtn) {
      takeNum(followsBtn.getAttribute("aria-label") || "");
      takeNum(followsBtn.textContent || "");
      followsBtn.querySelectorAll("span").forEach((s) => takeNum(s.textContent || ""));
    }

    const fansBtn = document.querySelector('a[data-testid="profileHeaderFollowersButton"]');
    if (fansBtn) {
      takeNum(fansBtn.getAttribute("aria-label") || "");
      takeNum(fansBtn.textContent || "");
      fansBtn.querySelectorAll("span").forEach((s) => takeNum(s.textContent || ""));
    }

    return { following, followers };
  }

  function getExpectedCount(sectionLabel) {
    const sniff = sniffFollowingFollowerTotalsFromDom();
    const isFollowers = sectionLabel === "followers";
    const fromSniff = isFollowers ? sniff.followers : sniff.following;
    if (fromSniff > 0) return fromSniff;

    const selector = isFollowers
      ? 'a[data-testid="profileHeaderFollowersButton"]'
      : 'a[data-testid="profileHeaderFollowsButton"]';

    const el = document.querySelector(selector);
    if (!el) return 0;

    const aria = normalizeText(el.getAttribute("aria-label"));
    const m = aria.match(/(\d[\d,]*)\s+(followers|following)/i);
    if (m) {
      const value = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(value)) return value;
    }

    const countText = normalizeText(el.querySelector("span")?.textContent);
    const parsed = parseAbbreviatedCount(countText);
    return parsed > 0 ? parsed : 0;
  }

  function getListScroller() {
    const firstCard = document.querySelector('a[href^="/profile/"][aria-label^="View "]');
    if (!firstCard) return document.scrollingElement || document.documentElement;

    let el = firstCard.parentElement;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const canScroll = (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight + 50
      );
      if (canScroll) return el;
      el = el.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function scrollToBottom(scroller) {
    const isDocumentScroller = (
      scroller === document.scrollingElement ||
      scroller === document.documentElement ||
      scroller === document.body
    );

    if (isDocumentScroller) {
      window.scrollTo(0, document.body.scrollHeight);
      window.scrollBy(0, Math.max(300, Math.floor(window.innerHeight * 0.35)));
      return;
    }

    scroller.scrollTop = scroller.scrollHeight;
    scroller.scrollTop += Math.max(300, Math.floor(scroller.clientHeight * 0.35));
  }

  function parseUsersFromDom() {
    const users = [];
    const seen = new Set();
    const cards = Array.from(document.querySelectorAll('a[href^="/profile/"][aria-label^="View "]'));

    for (const card of cards) {
      const handle = extractHandle(card);
      if (!handle) continue;

      if (!card.querySelector('[data-testid="userAvatarImage"]')) continue;

      const key = handle.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const profileLink = toAbsoluteUrl(card.getAttribute("href") || "");
      const displayName = extractDisplayName(card, handle);

      users.push({
        displayName,
        username: handle,
        profileLink,
      });
    }

    return users;
  }

  const STALL_NO_NEW_MS = 15_000;

  async function scrollCollect(sectionLabel) {
    const map = new Map();
    let stableTicks = 0;
    let previousCount = -1;
    const expectedCount = getExpectedCount(sectionLabel);
    let lastGrowthAt = Date.now();

    for (let i = 0; i < 1400; i++) {
      if (stopRequested) return null;
      const beforeCount = map.size;
      const users = parseUsersFromDom();
      users.forEach((user) => map.set(user.username.toLowerCase(), user));

      const currentCount = map.size;
      if (currentCount > beforeCount) lastGrowthAt = Date.now();

      const targetText = expectedCount ? ` / ~${expectedCount}` : "";
      setStatus(`Collecting ${sectionLabel}: ${currentCount}${targetText}`);

      const scroller = getListScroller();
      scrollToBottom(scroller);
      await sleep(900);

      if (currentCount === previousCount) stableTicks += 1;
      else stableTicks = 0;

      previousCount = currentCount;

      if (Date.now() - lastGrowthAt >= STALL_NO_NEW_MS) {
        setStatus(
          `${sectionLabel}: no new users for 15s — stopping scroll here (${currentCount} collected). Continuing run…`,
          true,
        );
        break;
      }

      if (stableTicks >= 120) break;

      if (i > 0 && i % 45 === 0) await sleep(1200);
    }

    return {
      users: [...map.values()],
      expectedCount,
    };
  }

  function buildInCommon(following, followers) {
    const followerSet = new Set(followers.map((u) => u.username.toLowerCase()));
    return following.filter((u) => followerSet.has(u.username.toLowerCase()));
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }

  function downloadCsv(state, following, followers, common) {
    let expFollow = Number(state.expectedFollowersCount) || 0;
    let expFollowing = Number(state.expectedFollowingCount) || 0;
    const live = sniffFollowingFollowerTotalsFromDom();
    if (expFollowing <= 0 && live.following > 0) expFollowing = live.following;
    if (expFollow <= 0 && live.followers > 0) expFollow = live.followers;

    const missFollowing = Math.max(0, expFollowing - following.length);
    const missFollowers = Math.max(0, expFollow - followers.length);

    const headerRow = [
      "FOLLOWING", "Display name", "Username", "Profile link",
      "FOLLOWED", "Display name", "Username", "Profile link",
      "IN COMMON", "Display name", "Username", "Profile link",
      "MISSING FOLLOWING:",
      String(missFollowing),
      "MISSING FOLLOWERS:",
      String(missFollowers),
    ];
    const rows = [headerRow];
    const maxLen = Math.max(following.length, followers.length, common.length);

    for (let i = 0; i < maxLen; i++) {
      const row = new Array(16).fill("");

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

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.displayName || state.handle || "bluesky-user"} bluesky.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function runOrResume() {
    const ctx = getContext();
    let state = loadState();
    if (!state) return;

    setButtonState("Running...", true);
    setStopVisible(true);

    if (!state.followers) {
      if (ctx.pageType !== "followers") {
        window.location.href = `/profile/${state.handle}/followers`;
        return;
      }
      const followersRes = await scrollCollect("followers");
      if (stopRequested) {
        clearState();
        setButtonState("Dump CSV", false);
        setStatus("Stopped.", true);
        setStopVisible(false);
        return;
      }
      state.followers = (followersRes && followersRes.users) || [];
      state.expectedFollowersCount = (followersRes && followersRes.expectedCount) || 0;
      saveState(state);
      setStatus("Opening following list…", true);
      window.location.href = `/profile/${state.handle}/follows`;
      return;
    }

    if (!state.following) {
      if (ctx.pageType !== "follows") {
        window.location.href = `/profile/${state.handle}/follows`;
        return;
      }
      const followingRes = await scrollCollect("following");
      if (stopRequested) {
        clearState();
        setButtonState("Dump CSV", false);
        setStatus("Stopped.", true);
        setStopVisible(false);
        return;
      }
      state.following = (followingRes && followingRes.users) || [];
      state.expectedFollowingCount = (followingRes && followingRes.expectedCount) || 0;
      saveState(state);
    }

    const following = state.following || [];
    const followers = state.followers || [];
    const common = buildInCommon(following, followers);

    downloadCsv(state, following, followers, common);
    setStatus(
      `Done: following ${following.length}, followed ${followers.length}, common ${common.length}.`,
      true,
    );
    clearState();
    setButtonState("Dump CSV", false);
    setStopVisible(false);
  }

  function onDumpClick() {
    const ctx = getContext();
    stopRequested = false;
    if (!ctx.handle) {
      setStatus("Open a Bluesky profile first.", true);
      return;
    }

    const state = {
      handle: ctx.handle,
      displayName: getDisplayNameNow(),
      followers: null,
      following: null,
      expectedFollowersCount: 0,
      expectedFollowingCount: 0,
    };

    saveState(state);
    runOrResume();
  }

  function init() {
    ensureButton();
    setButtonState("Dump CSV", false);
    setStopVisible(false);

    if (loadState()) runOrResume();

    new MutationObserver(() => {
      ensureButton();
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
