// ==UserScript==
// @name         SoundCloud Followers/Following Dumper
// @namespace    whereami.soundcloud.tools
// @version      1.0.0
// @description  Dump SoundCloud followers, following, and common users to CSV.
// @match        https://soundcloud.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STATE_KEY = "tm_soundcloud_dump_state_v1";

  const BTN_ID = "tm-sc-dump-btn";
  const STATUS_ID = "tm-sc-dump-status";
  const STOP_ID = "tm-sc-stop-btn";

  let stopRequested = false;

  const sleep = (ms) =>
    new Promise((r) => setTimeout(r, ms));

  function getContext() {
    const parts =
      location.pathname
        .split("/")
        .filter(Boolean);

    return {
      username:
        parts[0] || null,

      pageType:
        parts[1] || "profile",
    };
  }


  function loadState() {
    try {
      return JSON.parse(
        sessionStorage.getItem(
          STATE_KEY
        )
      );
    } catch {
      return null;
    }
  }

  function saveState(state) {
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify(state)
    );
  }

  function clearState() {
    sessionStorage.removeItem(
      STATE_KEY
    );
  }

  function ensureStyles() {
    if (
      document.getElementById(
        "tm-sc-style"
      )
    )
      return;

    const style =
      document.createElement(
        "style"
      );

    style.id = "tm-sc-style";

    style.textContent = `
      #${STATUS_ID} {
        position: fixed;
        right: 16px;
        bottom: 56px;
        z-index: 2147483647;
        background: rgba(0,0,0,0.85);
        color: #fff;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 12px;
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
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        display: none;
      }

      #${BTN_ID} {
        background:#ff5500 !important;
        color:white !important;
        cursor:pointer;
      }

      #${BTN_ID}[disabled] {
        opacity:.7;
        cursor:default;
      }
    `;

    document.head.appendChild(
      style
    );
  }

  function setStatus(
    text,
    visible = true
  ) {
    let el =
      document.getElementById(
        STATUS_ID
      );

    if (!el) {
      el =
        document.createElement(
          "div"
        );

      el.id = STATUS_ID;

      document.body.appendChild(
        el
      );
    }

    el.textContent = text;

    el.style.display = visible
      ? "block"
      : "none";
  }

  function setStopVisible(v) {
    let btn =
      document.getElementById(
        STOP_ID
      );

    if (!btn) {
      btn =
        document.createElement(
          "button"
        );

      btn.id = STOP_ID;

      btn.textContent = "Stop";

      btn.onclick = () => {
        stopRequested = true;

        clearState();

        setStatus("Stopping...");
      };

      document.body.appendChild(
        btn
      );
    }

    btn.style.display = v
      ? "block"
      : "none";
  }

  function setButtonState(
    text,
    disabled
  ) {
    const btn =
      document.getElementById(
        BTN_ID
      );

    if (!btn) return;

    btn.textContent = text;

    btn.disabled = !!disabled;
  }

  function ensureButton() {
    ensureStyles();

    const row =
      document.querySelector(
        ".infoStats__table tbody tr"
      );

    const existing =
      document.getElementById(
        BTN_ID
      );

    if (!row) {
      if (existing)
        existing.remove();

      return;
    }

    if (existing) return;

    const stats =
      row.querySelectorAll(
        ".infoStats__stat"
      );

    const tracksCell =
      stats[2];

    const td =
      document.createElement(
        "td"
      );

    td.id = BTN_ID;

    td.className =
      "infoStats__stat sc-link-light sc-border-light-right";

    td.innerHTML = `
      <div
        class="infoStats__statLink"
        style="
          background:#ff5500;
          border-radius:4px;
          padding:8px 12px;
          cursor:pointer;
          height:100%;
          box-sizing:border-box;
        "
      >
        <h3
          class="infoStats__title sc-font-light"
          style="color:white !important;"
        >
          Dump
        </h3>

        <div
          class="infoStats__value sc-font-light"
          style="color:white !important;"
        >
          CSV
        </div>
      </div>
    `;

    td.onclick = onDumpClick;

    if (tracksCell) {
      row.insertBefore(
        td,
        tracksCell
      );
    } else {
      row.appendChild(td);
    }
  }

  async function waitForUsers(
    timeout = 45000
  ) {
    const start = Date.now();

    while (
      Date.now() - start <
      timeout
    ) {
      if (stopRequested)
        return false;

      const users = [
        ...document.querySelectorAll(
          "li.badgeList__item"
        ),
      ].filter(
        (x) =>
          !x.querySelector(
            ".audibleTilePlaceholder"
          ) &&
          x.querySelector(
            ".userBadgeListItem__heading"
          )
      );

      if (users.length > 0) {
        return true;
      }

      await sleep(500);
    }

    return false;
  }

  function parseUsers() {
    const users = [];

    const seen = new Set();

    [
      ...document.querySelectorAll(
        "li.badgeList__item"
      ),
    ].forEach((item) => {

      if (
        item.querySelector(
          ".audibleTilePlaceholder"
        )
      ) {
        return;
      }

      const heading =
        item.querySelector(
          ".userBadgeListItem__heading"
        );

      if (!heading) return;

      const profileLink =
        heading.href;

      if (
        !profileLink ||
        seen.has(profileLink)
      ) {
        return;
      }

      seen.add(profileLink);

      const displayName =
        heading.textContent.trim();

      const username =
        heading
          .getAttribute(
            "href"
          )
          ?.replace(/\//g, "")
          ?.trim() || "";

      users.push({
        displayName,
        username,
        profileLink,
      });
    });

    return users;
  }

  async function scrollCollect(
    label
  ) {
    const map = new Map();

    let stable = 0;
    let prev = 0;

    for (
      let i = 0;
      i < 500;
      i++
    ) {
      if (stopRequested)
        return null;

      parseUsers().forEach(
        (u) => {
          map.set(
            u.profileLink,
            u
          );
        }
      );

      const size =
        map.size;

      setStatus(
        `Collecting ${label}: ${size}`
      );

      window.scrollTo(
        0,
        document.body
          .scrollHeight
      );

      await sleep(1800);

      if (size === prev) {
        stable++;
      } else {
        stable = 0;
      }

      prev = size;

      if (stable >= 10)
        break;
    }

    return [
      ...map.values(),
    ];
  }

  function buildInCommon(
    following,
    followers
  ) {
    const followerSet =
      new Set(
        followers.map((u) =>
          u.username.toLowerCase()
        )
      );

    return following.filter(
      (u) =>
        followerSet.has(
          u.username.toLowerCase()
        )
    );
  }

  function csvEscape(value) {
    const text = String(
      value ?? ""
    );

    if (/[",\n]/.test(text)) {
      return `"${text.replace(
        /"/g,
        "\"\""
      )}"`;
    }

    return text;
  }

  function downloadCsv(
    username,
    following,
    followers,
    common
  ) {
    const headers = [
      "FOLLOWING",
      "Display name",
      "Username",
      "Profile link",

      "FOLLOWERS",
      "Display name",
      "Username",
      "Profile link",

      "IN COMMON",
      "Display name",
      "Username",
      "Profile link",
    ];

    const rows = [headers];

    const maxRows =
      Math.max(
        following.length,
        followers.length,
        common.length
      );

    for (
      let i = 0;
      i < maxRows;
      i++
    ) {
      const row =
        new Array(12).fill(
          ""
        );

      const a =
        following[i];

      if (a) {
        row[1] =
          a.displayName;

        row[2] =
          a.username;

        row[3] =
          a.profileLink;
      }

      const b =
        followers[i];

      if (b) {
        row[5] =
          b.displayName;

        row[6] =
          b.username;

        row[7] =
          b.profileLink;
      }

      const c = common[i];

      if (c) {
        row[9] =
          c.displayName;

        row[10] =
          c.username;

        row[11] =
          c.profileLink;
      }

      rows.push(row);
    }

    const csv = rows
      .map((r) =>
        r
          .map(csvEscape)
          .join(",")
      )
      .join("\n");

    const blob =
      new Blob(
        [
          "\uFEFF" + csv,
        ],
        {
          type:
            "text/csv;charset=utf-8;",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const a =
      document.createElement(
        "a"
      );

    a.href = url;

    a.download =
      `${username} soundcloud.csv`;

    document.body.appendChild(
      a
    );

    a.click();

    a.remove();

    URL.revokeObjectURL(
      url
    );
  }

  async function runOrResume() {
    const ctx =
      getContext();

    const state =
      loadState();

    if (!state) return;

    setButtonState(
      "Running...",
      true
    );

    setStopVisible(true);

    if (!state.following) {
      if (
        ctx.pageType !==
        "following"
      ) {
        location.href = `/${state.username}/following`;

        return;
      }

      setStatus(
        "Waiting for following..."
      );

      const ok =
        await waitForUsers();

      if (!ok) {
        setStatus(
          "Timed out loading following."
        );

        return;
      }

      state.following =
        await scrollCollect(
          "following"
        );

      if (
        stopRequested ||
        !state.following
      ) {
        clearState();

        setButtonState(
          "Dump CSV",
          false
        );

        setStopVisible(
          false
        );

        return;
      }

      saveState(state);

      location.href = `/${state.username}/followers`;

      return;
    }

    if (!state.followers) {
      if (
        ctx.pageType !==
        "followers"
      ) {
        location.href = `/${state.username}/followers`;

        return;
      }

      setStatus(
        "Waiting for followers..."
      );

      const ok =
        await waitForUsers();

      if (!ok) {
        setStatus(
          "Timed out loading followers."
        );

        return;
      }

      state.followers =
        await scrollCollect(
          "followers"
        );

      if (
        stopRequested ||
        !state.followers
      ) {
        clearState();

        setButtonState(
          "Dump CSV",
          false
        );

        setStopVisible(
          false
        );

        return;
      }

      saveState(state);
    }

    const common =
      buildInCommon(
        state.following,
        state.followers
      );

    downloadCsv(
      state.username,
      state.following,
      state.followers,
      common
    );

    setStatus(
      `Done: following ${state.following.length}, followers ${state.followers.length}, common ${common.length}`
    );

    clearState();

    setButtonState(
      "Dump CSV",
      false
    );

    setStopVisible(false);
  }

  function onDumpClick() {
    const ctx =
      getContext();

    if (!ctx.username) {
      setStatus(
        "Open a profile first."
      );

      return;
    }

    stopRequested = false;

    clearState();

    saveState({
      username:
        ctx.username,

      following: null,

      followers: null,
    });

    runOrResume();
  }

  function init() {
    ensureButton();

    setButtonState(
      "Dump CSV",
      false
    );

    setStopVisible(false);

    const state =
      loadState();

    if (state) {
      runOrResume();
    }

    new MutationObserver(
      ensureButton
    ).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (
    document.readyState ===
    "loading"
  ) {
    window.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }
})();