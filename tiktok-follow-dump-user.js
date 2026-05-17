// ==UserScript==
// @name         TikTok Dumper
// @namespace    comshit.tiktok.tools
// @version      1.0.2
// @description  Dump following, followers, and common users to a CSV file.
// @author       you
// @match        https://www.tiktok.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STATE_KEY = "tm_tiktok_dump_state_v1";
  const BTN_ID = "tm-tiktok-dump-btn";
  const STATUS_ID = "tm-tiktok-dump-status";
  const STOP_ID = "tm-tiktok-stop-btn";
  const USER_CONTAINER_SELECTOR = "li div[class*='DivUserContainer']";

  let isCollectingNow = false;
  let stopRequested = false;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getContext() {
    const match = window.location.pathname.match(/\/@([^/]+)/i);
    return {
      account: match?.[1] || null,
      pageType: null,
    };
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
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
    if (document.getElementById("tm-tiktok-dump-style")) return;

    const style = document.createElement("style");
    style.id = "tm-tiktok-dump-style";
    style.textContent = `
      #${BTN_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        border: 0;
        border-radius: 10px;
        background: #fe2c55;
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        padding: 10px 12px;
        cursor: pointer;
        box-shadow: 0 3px 12px rgba(0,0,0,0.25);
      }

      #${BTN_ID}[disabled] {
        opacity: 0.65;
        cursor: default;
      }

      #${STATUS_ID} {
        position: fixed;
        right: 16px;
        bottom: 62px;
        z-index: 2147483647;
        background: rgba(0, 0, 0, 0.75);
        color: #fff;
        font-size: 12px;
        padding: 7px 10px;
        border-radius: 8px;
        max-width: 320px;
        line-height: 1.35;
        display: none;
      }

      #${STOP_ID} {
        position: fixed;
        right: 140px;
        bottom: 16px;
        z-index: 2147483647;
        border: 0;
        border-radius: 999px;
        background: #c62828;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        padding: 10px 12px;
        cursor: pointer;
        display: none;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureUi() {
    ensureStyles();

    if (!document.getElementById(STATUS_ID)) {
      const status = document.createElement("div");
      status.id = STATUS_ID;
      document.body.appendChild(status);
    }

    if (!document.getElementById(BTN_ID)) {
      const button = document.createElement("button");
      button.id = BTN_ID;
      button.type = "button";
      button.textContent = "Dump TikTok Lists";
      button.addEventListener("click", onDumpButtonClick);
      document.body.appendChild(button);
    }

    if (!document.getElementById(STOP_ID)) {
      const stop = document.createElement("button");
      stop.id = STOP_ID;
      stop.type = "button";
      stop.textContent = "Stop";
      stop.addEventListener("click", () => {
        stopRequested = true;
        setStatus("Stopping...");
      });
      document.body.appendChild(stop);
    }
  }

  function setButtonState(text, disabled) {
    const button = document.getElementById(BTN_ID);
    if (!button) return;
    button.textContent = text;
    button.disabled = !!disabled;
  }

  function setStatus(message, visible = true) {
    const status = document.getElementById(STATUS_ID);
    if (!status) return;
    status.textContent = message;
    status.style.display = visible ? "block" : "none";
  }

  function setStopVisible(visible) {
    const stop = document.getElementById(STOP_ID);
    if (!stop) return;
    stop.style.display = visible ? "block" : "none";
  }

  function normalizeUsername(value) {
    return (value || "").trim().replace(/^@/, "");
  }

  function toAbsoluteProfileUrl(href) {
    try {
      return new URL(href, window.location.origin).toString();
    } catch {
      return "";
    }
  }

  function getUsersFromDom(root = document) {
    const containers = Array.from(root.querySelectorAll(USER_CONTAINER_SELECTOR));
    const seen = new Set();
    const users = [];

    for (const container of containers) {
      const link = container.querySelector("a[href^='/@'], a[href*='tiktok.com/@']");
      if (!link) continue;

      const href = link.getAttribute("href") || "";
      const url = toAbsoluteProfileUrl(href);
      const userMatch = href.match(/\/@([^/?#]+)/i) || url.match(/\/@([^/?#]+)/i);
      const usernameFromHref = normalizeUsername(userMatch?.[1] || "");

      const displayName = (container.querySelector("span[class*='SpanNickname']")?.textContent || "").trim();
      const usernameText = (container.querySelector("p[class*='PUniqueId']")?.textContent || "").trim();
      const username = normalizeUsername(usernameText || usernameFromHref);

      if (!username || seen.has(username.toLowerCase())) continue;
      seen.add(username.toLowerCase());

      users.push({
        displayName: displayName || username,
        username,
        profileLink: url,
      });
    }

    return users;
  }

  function getScrollContainer() {
    const firstUser = document.querySelector(USER_CONTAINER_SELECTOR);
    if (!firstUser) return document.scrollingElement || document.documentElement;

    let el = firstUser.parentElement;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const scrollable = (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 20;
      if (scrollable) return el;
      el = el.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  async function scrollToListBottom() {
    const scroller = getScrollContainer();
    let lastHeight = -1;
    let lastCount = -1;
    let stableTicks = 0;

    for (let i = 0; i < 180; i++) {
      if (stopRequested) return false;
      if (scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement) {
        window.scrollTo(0, document.body.scrollHeight);
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
      await sleep(700);

      const height = scroller.scrollHeight;
      const count = document.querySelectorAll(USER_CONTAINER_SELECTOR).length;

      if (height === lastHeight && count === lastCount) {
        stableTicks += 1;
      } else {
        stableTicks = 0;
      }

      lastHeight = height;
      lastCount = count;

      setStatus(`Scrolling list... loaded users: ${count}`);

      if (stableTicks >= 8) break;
    }
    return true;
  }

  function buildInCommon(following, followers) {
    const followMap = new Map();
    for (const user of following) {
      followMap.set(user.username.toLowerCase(), user);
    }

    const common = [];
    const seen = new Set();
    for (const user of followers) {
      const key = user.username.toLowerCase();
      if (!followMap.has(key) || seen.has(key)) continue;
      seen.add(key);
      common.push(followMap.get(key));
    }
    return common;
  }

  function csvEscape(value) {
    const raw = String(value ?? "");
    if (/[",\n]/.test(raw)) {
      return `"${raw.replace(/"/g, "\"\"")}"`;
    }
    return raw;
  }

  function downloadCsv(account, following, followers, common) {
    const headers = [
      "FOLLOWING", "Display name", "Username", "Profile link",
      "FOLLOWERS", "Display name", "Username", "Profile link",
      "IN COMMON", "Display name", "Username", "Profile link",
    ];

    const maxRows = Math.max(following.length, followers.length, common.length);
    const rows = [headers];

    for (let i = 0; i < maxRows; i++) {
      const row = new Array(12).fill("");

      const f1 = following[i];
      if (f1) {
        row[1] = f1.displayName;
        row[2] = f1.username;
        row[3] = f1.profileLink;
      }

      const f2 = followers[i];
      if (f2) {
        row[5] = f2.displayName;
        row[6] = f2.username;
        row[7] = f2.profileLink;
      }

      const c = common[i];
      if (c) {
        row[9] = c.displayName;
        row[10] = c.username;
        row[11] = c.profileLink;
      }

      rows.push(row);
    }

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    const name = account || "unknown";
    a.download = `${name} tiktok.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findClickableAncestor(node) {
    let el = node;
    for (let i = 0; i < 8 && el; i++) {
      if (
        el.tagName === "BUTTON" ||
        el.tagName === "A" ||
        el.getAttribute("role") === "button" ||
        el.getAttribute("role") === "tab" ||
        el.hasAttribute("tabindex")
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return node;
  }

  function clickElement(el) {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function fireClickSequence(el) {
    if (!el) return;
    const common = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent("pointerdown", common));
    el.dispatchEvent(new MouseEvent("mousedown", common));
    el.dispatchEvent(new MouseEvent("pointerup", common));
    el.dispatchEvent(new MouseEvent("mouseup", common));
    el.dispatchEvent(new MouseEvent("click", common));
  }

  function getFollowPopup() {
    const popup = document.querySelector('[data-e2e="follow-info-popup"]');
    return popup && isElementVisible(popup) ? popup : null;
  }

  function getPopupTabItems(popup) {
    if (!popup) return [];
    return Array.from(popup.querySelectorAll('div[class*="DivTabs"] > div[class*="DivTabItem"]')).filter(isElementVisible);
  }

  function getPopupTabLabel(tabItem) {
    if (!tabItem) return "";
    const strongTitle = (tabItem.querySelector("strong[title]")?.getAttribute("title") || "").trim();
    if (strongTitle) return strongTitle.toLowerCase();
    const nestedDiv = (tabItem.querySelector("div")?.textContent || "").trim();
    if (nestedDiv) return nestedDiv.toLowerCase();
    return normalizeText(tabItem.textContent || "");
  }

  function isPopupTabActive(tabItem) {
    if (!tabItem) return false;
    const cls = tabItem.className || "";
    return /\bcss-krn68h\b/i.test(cls);
  }

  function getActivePopupTabLabel() {
    const popup = getFollowPopup();
    if (!popup) return "";
    const items = getPopupTabItems(popup);
    const active = items.find((item) => isPopupTabActive(item));
    if (!active) return "";
    return getPopupTabLabel(active);
  }

  async function switchPopupTab(target) {
    const popup = getFollowPopup();
    if (!popup) return false;

    const targetLower = target.toLowerCase();
    const items = getPopupTabItems(popup);
    if (!items.length) return false;

    const tab = items.find((item) => {
      const label = getPopupTabLabel(item);
      return label === targetLower || label.startsWith(targetLower);
    });
    if (!tab) return false;

    // Hit the tab item and likely clickable children to satisfy TikTok's handlers.
    const tapTargets = [tab, tab.querySelector("div"), tab.querySelector("strong")].filter(Boolean);
    for (const targetEl of tapTargets) {
      fireClickSequence(targetEl);
    }

    // Retry if state did not switch immediately.
    for (let i = 0; i < 5; i++) {
      await sleep(180);
      if (isPopupTabActive(tab)) return true;
      for (const targetEl of tapTargets) {
        fireClickSequence(targetEl);
      }
    }

    return isPopupTabActive(tab);
  }

  function getProfileStatsTrigger(target) {
    const candidates = [
      ...Array.from(document.querySelectorAll(`[data-e2e="${target}-count"]`)),
      ...Array.from(document.querySelectorAll(`[data-e2e="${target}"]`)),
    ].filter(isElementVisible);

    if (candidates.length === 0) return null;
    return findClickableAncestor(candidates[0]);
  }

  function getActiveDialog() {
    const candidates = Array.from(document.querySelectorAll("[role='dialog'], div[class*='Modal']"));
    return candidates.find(isElementVisible) || null;
  }

  function getDialogTabTrigger(dialog, target) {
    if (!dialog) return null;
    const byE2e = dialog.querySelector(`[data-e2e="${target}"], [data-e2e="${target}-count"]`);
    if (byE2e && isElementVisible(byE2e)) {
      return findClickableAncestor(byE2e);
    }

    // Prefer TikTok followers/following tab strip nodes first:
    // <div class="...DivTabs..."><div class="...DivTabItem..."><div>Following</div><strong title="Following">...</strong></div>...
    const titleCaseTarget = target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
    const titleNode = dialog.querySelector(`div[class*="DivTabs"] strong[title="${titleCaseTarget}"]`);
    if (titleNode && isElementVisible(titleNode)) {
      return findClickableAncestor(titleNode);
    }

    const tabItems = Array.from(dialog.querySelectorAll(`div[class*="DivTabs"] div[class*="DivTabItem"]`));
    for (const item of tabItems) {
      if (!isElementVisible(item)) continue;
      const txt = normalizeText(item.textContent);
      if (txt.startsWith(target) || txt === target) {
        return findClickableAncestor(item);
      }
    }

    const targetText = normalizeText(target);
    const candidates = Array.from(dialog.querySelectorAll("button, [role='tab'], [role='button'], a, strong, div"));
    for (const el of candidates) {
      if (!isElementVisible(el)) continue;
      const txt = normalizeText(el.textContent);
      const aria = normalizeText(el.getAttribute("aria-label") || "");
      if (
        txt === targetText ||
        txt.startsWith(`${targetText} `) ||
        txt === `${targetText}s` ||
        aria.includes(targetText)
      ) {
        return el;
      }
    }

    return null;
  }

  async function ensureListOpen(target) {
    const existingPopup = getFollowPopup();
    if (existingPopup) {
      const switched = await switchPopupTab(target);
      await sleep(400);
      if (!switched) return false;
      const activeLabel = getActivePopupTabLabel();
      if (!(activeLabel === target || activeLabel.startsWith(target))) return false;
      return !!document.querySelector(USER_CONTAINER_SELECTOR);
    }

    const profileTrigger = getProfileStatsTrigger(target);
    if (!profileTrigger) {
      return false;
    }
    clickElement(profileTrigger);
    await sleep(900);

    const switched = await switchPopupTab(target);
    if (!switched) return false;

    for (let i = 0; i < 15; i++) {
      if (document.querySelector(USER_CONTAINER_SELECTOR)) return true;
      await sleep(250);
    }

    return false;
  }

  async function collectCurrentPageUsers(pageType) {
    if (isCollectingNow) return null;
    isCollectingNow = true;

    try {
      setStatus(`Collecting ${pageType} list...`);
      const opened = await ensureListOpen(pageType);
      if (!opened) {
        setStatus(`Could not open ${pageType} list. Open the ${pageType} popup/tab first and try again.`);
        return [];
      }
      if (stopRequested) return null;
      await sleep(500);
      const finished = await scrollToListBottom();
      if (!finished || stopRequested) return null;
      const users = getUsersFromDom();
      setStatus(`Collected ${users.length} ${pageType} users.`);
      return users;
    } finally {
      isCollectingNow = false;
    }
  }

  async function runOrResume() {
    const context = getContext();
    if (!context.account) {
      setStatus("Open a TikTok profile first (/@user).", true);
      setButtonState("Dump TikTok Lists", false);
      return;
    }

    let state = loadState();
    if (!state || state.status !== "running" || state.account !== context.account) {
      state = {
        status: "running",
        account: context.account,
        following: null,
        followers: null,
        createdAt: Date.now(),
      };
      saveState(state);
    }

    setButtonState("Dump Running...", true);
    setStopVisible(true);

    if (!state.following) {
      const following = await collectCurrentPageUsers("following");
      if (stopRequested || following === null) {
        clearState();
        setButtonState("Dump TikTok Lists", false);
        setStatus("Stopped.", true);
        setStopVisible(false);
        return;
      }
      state.following = following || [];
      saveState(state);
    }

    if (!state.followers) {
      const followers = await collectCurrentPageUsers("followers");
      if (stopRequested || followers === null) {
        clearState();
        setButtonState("Dump TikTok Lists", false);
        setStatus("Stopped.", true);
        setStopVisible(false);
        return;
      }
      state.followers = followers || [];
      saveState(state);
    }

    const following = state.following || [];
    const followers = state.followers || [];
    const common = buildInCommon(following, followers);
    downloadCsv(context.account, following, followers, common);

    setStatus(
      `Done: following ${following.length}, followers ${followers.length}, common ${common.length}. CSV downloaded.`,
      true,
    );
    setButtonState("Dump TikTok Lists", false);
    clearState();
    setStopVisible(false);
  }

  async function onDumpButtonClick() {
    const context = getContext();
    if (!context.account) {
      setStatus("Not on a user profile URL. Open /@username first.", true);
      return;
    }

    stopRequested = false;
    clearState();
    await runOrResume();
  }

  function init() {
    ensureUi();
    setButtonState("Dump TikTok Lists", false);
    setStopVisible(false);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
