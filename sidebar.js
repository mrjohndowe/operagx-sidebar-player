
const player = document.getElementById("videoPlayer");
const empty = document.getElementById("empty");

const address = document.getElementById("address");
const titleEl = document.getElementById("videoTitle");
const videoURL = document.getElementById("videoURL");
const statusEl = document.getElementById("status");
const sourceTab = document.getElementById("sourceTab");
const playbackStatus = document.getElementById("playbackStatus");

const playlistEl = document.getElementById("playlist");
const countEl = document.getElementById("videoCount");
const followButton = document.getElementById("followTab");

const STORAGE_KEY = "avsc_sidebar_playlist_v1";

let playlist = [];
let selectedId = null;
let autoAdd = true;
let lastAutoKey = "";

function makeId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2);
}

function videoKey(data) {
  return data.embed || data.url;
}

function selectedVideo() {
  return playlist.find(v => v.id === selectedId) || null;
}

function savePlaylist() {
  chrome.storage.local.set({
    [STORAGE_KEY]: playlist,
    avsc_selected_id: selectedId
  });
}

function renderPlaylist() {
  playlistEl.replaceChildren();

  countEl.textContent =
    `${playlist.length} video${playlist.length === 1 ? "" : "s"}`;

  if (!playlist.length) {
    const note = document.createElement("div");
    note.className = "playlist-empty";
    note.textContent = "No videos saved. Open a video and press Add Video.";
    playlistEl.append(note);
    return;
  }

  playlist.forEach(item => {
    const row = document.createElement("div");
    row.className =
      "playlist-item" +
      (item.id === selectedId ? " selected" : "");

    const select = document.createElement("button");
    select.className = "playlist-select";
    select.textContent = item.title || "Saved video";
    select.title = item.url || "";
    select.onclick = () => selectVideo(item.id);

    const remove = document.createElement("button");
    remove.className = "playlist-remove";
    remove.textContent = "×";
    remove.title = "Remove video";

    remove.onclick = event => {
      event.stopPropagation();
      removeVideo(item.id);
    };

    row.append(select, remove);
    playlistEl.append(row);
  });
}

function selectVideo(id) {
  selectedId = id;

  const item = selectedVideo();
  if (!item) return;

  address.value = item.url || "";
  titleEl.textContent = item.title || "Unknown video";
  videoURL.textContent = item.embed || "";
  sourceTab.textContent = item.tabId ?? "Unknown";

  statusEl.textContent = "VIDEO LOADED";
  playbackStatus.textContent = "Playlist video selected";

  empty.classList.add("hidden");

  if (player.src !== item.embed) {
    player.src = item.embed;
  }

  renderPlaylist();
  savePlaylist();
}

function addVideo(data, options = {}) {
  if (!data || !data.embed) {
    statusEl.textContent = "NO VIDEO";
    playbackStatus.textContent = "No supported video detected";
    return false;
  }

  const key = videoKey(data);

  let item = playlist.find(v => videoKey(v) === key);

  if (!item) {
    item = {
      id: makeId(),
      title: data.title || "Untitled video",
      url: data.url || "",
      embed: data.embed,
      tabId: data.tabId ?? null,
      addedAt: Date.now()
    };

    playlist.unshift(item);
  } else {
    item.title = data.title || item.title;
    item.url = data.url || item.url;
    item.tabId = data.tabId ?? item.tabId;
  }

  if (options.select !== false) {
    selectVideo(item.id);
  } else {
    renderPlaylist();
    savePlaylist();
  }

  if (options.auto) {
    playbackStatus.textContent = "Auto-added from browser tab";
  } else {
    playbackStatus.textContent = "Video added to playlist";
  }

  return true;
}

function removeVideo(id) {
  playlist = playlist.filter(v => v.id !== id);

  if (selectedId === id) {
    selectedId = playlist[0]?.id || null;

    if (selectedId) {
      selectVideo(selectedId);
    } else {
      player.src = "about:blank";
      empty.classList.remove("hidden");

      titleEl.textContent = "No video selected";
      videoURL.textContent = "";
      address.value = "";
      sourceTab.textContent = "—";
    }
  }

  renderPlaylist();
  savePlaylist();
}

function refreshActiveTab() {
  chrome.runtime.sendMessage(
    { type: "GET_ACTIVE_VIDEO" },
    response => {
      if (chrome.runtime.lastError || !response) return;

      addVideo(response);
    }
  );
}

function updateFollowButton() {
  followButton.textContent =
    `Auto-add: ${autoAdd ? "ON" : "OFF"}`;

  followButton.classList.toggle("active", autoAdd);
}

document.getElementById("addVideo").onclick = refreshActiveTab;
document.getElementById("refresh").onclick = refreshActiveTab;
document.getElementById("back").onclick = refreshActiveTab;
document.getElementById("forward").onclick = refreshActiveTab;

document.getElementById("reload").onclick = () => {
  const item = selectedVideo();
  if (item) player.src = item.embed;
};

followButton.onclick = () => {
  autoAdd = !autoAdd;
  updateFollowButton();

  playbackStatus.textContent =
    autoAdd ? "Auto-add enabled" : "Auto-add disabled";
};

document.getElementById("clearVideos").onclick = () => {
  if (!confirm("Remove all videos from the playlist?")) return;

  playlist = [];
  selectedId = null;

  player.src = "about:blank";
  empty.classList.remove("hidden");

  titleEl.textContent = "No video selected";
  videoURL.textContent = "";
  address.value = "";
  sourceTab.textContent = "—";

  renderPlaylist();
  savePlaylist();
};

// Automatically add supported videos when switching tabs.
chrome.runtime.onMessage.addListener(message => {
  if (message.type !== "ACTIVE_VIDEO") return;

  const data = message.data;
  if (!data?.embed || !autoAdd) return;

  const key = videoKey(data);

  if (key !== lastAutoKey) {
    lastAutoKey = key;
    addVideo(data, { auto: true });
  }
});

// Restore playlist after sidebar reopening.
chrome.storage.local.get(
  [STORAGE_KEY, "avsc_selected_id"],
  result => {
    playlist = Array.isArray(result[STORAGE_KEY])
      ? result[STORAGE_KEY]
      : [];

    selectedId =
      result.avsc_selected_id ||
      playlist[0]?.id ||
      null;

    renderPlaylist();

    if (selectedId) {
      selectVideo(selectedId);
    } else {
      refreshActiveTab();
    }
  }
);

updateFollowButton();
