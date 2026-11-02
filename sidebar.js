
"use strict";

/* =========================================================
   STORAGE
========================================================= */

const STORAGE = {
    playlists: "avsc_named_playlists_v1",
    current: "avsc_sidebar_playlist_v1",
    activeName: "avsc_active_playlist_name",
    autoAdd: "avsc_auto_add_v1"
};

let playlists = {};
let currentPlaylist = [];
let activePlaylistName = "Untitled Playlist";

let autoAdd = false;
let selectedVideoId = null;
let currentVideoUrl = null;
let currentVideoTitle = null;
let lastAutoAddedUrl = null;
let saveTimer = null;

const $ = id => document.getElementById(id);

function createId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeUrl(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = "";
        return parsed.href;
    } catch {
        return url;
    }
}

/* =========================================================
   STORAGE MANAGEMENT
========================================================= */

function saveStorageNow() {
    const data = {
        [STORAGE.playlists]: playlists,
        [STORAGE.current]: currentPlaylist,
        [STORAGE.activeName]: activePlaylistName,
        [STORAGE.autoAdd]: autoAdd
    };

    chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
            setSaveStatus("SAVE FAILED");
            console.error(
                "Playlist save failed:",
                chrome.runtime.lastError.message
            );
            return;
        }

        setSaveStatus("Saved");
    });
}

function saveStorage() {
    clearTimeout(saveTimer);
    setSaveStatus("Saving...");

    saveTimer = setTimeout(saveStorageNow, 200);
}

function setSaveStatus(message) {
    const element = $("saveStatus");

    if (element) {
        element.textContent = message;
    }
}

function persistAndRender() {
    renderPlaylist();
    updateActiveName();
    saveStorage();
}

/* =========================================================
   PLAYLIST UI
========================================================= */

function updateActiveName() {
    $("activePlaylistName").textContent = activePlaylistName;
}

function renderSavedPlaylists() {
    const select = $("savedPlaylistSelect");
    const previous = select.value;

    select.innerHTML = "";

    const names = Object.keys(playlists).sort((a, b) =>
        a.localeCompare(b)
    );

    if (!names.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No saved playlists";
        select.appendChild(option);
    } else {
        names.forEach(name => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });

        if (names.includes(previous)) {
            select.value = previous;
        } else if (names.includes(activePlaylistName)) {
            select.value = activePlaylistName;
        }
    }

    $("loadPlaylistBtn").disabled = !names.length;
    $("deletePlaylistBtn").disabled = !names.length;
}

function renderPlaylist() {
    const container = $("playlistItems");
    container.innerHTML = "";

    $("playlistCount").textContent =
        `${currentPlaylist.length} video${currentPlaylist.length === 1 ? "" : "s"}`;

    if (!currentPlaylist.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Your playlist is empty.";
        container.appendChild(empty);
        return;
    }

    currentPlaylist.forEach((video, index) => {
        const item = document.createElement("div");
        item.className = "playlist-item";

        if (video.id === selectedVideoId) {
            item.classList.add("selected");
        }

        const play = document.createElement("button");
        play.className = "playlist-play";
        play.textContent = "▶";
        play.title = "Play";
        play.addEventListener("click", () => playVideo(video));

        const info = document.createElement("div");
        info.className = "playlist-info";

        const title = document.createElement("div");
        title.className = "playlist-item-title";
        title.textContent = video.title || `Video ${index + 1}`;

        const url = document.createElement("div");
        url.className = "playlist-item-url";
        url.textContent = video.url;

        info.append(title, url);
        info.addEventListener("click", () => playVideo(video));

        const remove = document.createElement("button");
        remove.className = "playlist-remove";
        remove.textContent = "×";
        remove.title = "Remove";
        remove.addEventListener("click", () => removeVideo(video.id));

        item.append(play, info, remove);
        container.appendChild(item);
    });
}

/* =========================================================
   VIDEO PLAYER
========================================================= */

function playVideo(video) {
    if (!video || !video.url) return;

    selectedVideoId = video.id;
    currentVideoUrl = video.url;
    currentVideoTitle = video.title || "Video";

    $("videoPlayer").src = video.url;
    $("playerTitle").textContent = currentVideoTitle;

    renderPlaylist();
}

function openVideoInTab() {
    if (!currentVideoUrl) {
        alert("Select a video first.");
        return;
    }

    chrome.tabs.create({ url: currentVideoUrl });
}

/* =========================================================
   ADD / REMOVE VIDEOS
========================================================= */

function addVideo(url, title = "Detected Video") {
    if (!url || !/^https?:\/\//i.test(url)) {
        alert("No valid video URL detected.");
        return;
    }

    const normalized = normalizeUrl(url);

    const existing = currentPlaylist.find(video =>
        normalizeUrl(video.url) === normalized
    );

    if (existing) {
        playVideo(existing);
        setSaveStatus("Already in playlist");
        return;
    }

    const video = {
        id: createId(),
        url,
        title: title || "Detected Video",
        addedAt: Date.now()
    };

    currentPlaylist.push(video);
    selectedVideoId = video.id;

    persistAndRender();
    playVideo(video);
}

function removeVideo(id) {
    currentPlaylist = currentPlaylist.filter(video => video.id !== id);

    if (selectedVideoId === id) {
        selectedVideoId = null;
    }

    persistAndRender();
}

function clearCurrentPlaylist() {
    if (!currentPlaylist.length) return;

    if (!confirm("Clear all videos from the active playlist?")) {
        return;
    }

    currentPlaylist = [];
    selectedVideoId = null;
    currentVideoUrl = null;

    $("videoPlayer").src = "about:blank";
    $("playerTitle").textContent = "Select a video to play";

    persistAndRender();
}

/* =========================================================
   NAMED PLAYLISTS
========================================================= */

function saveNamedPlaylist() {
    const entered = prompt(
        "Enter a name for this playlist:",
        activePlaylistName === "Untitled Playlist"
            ? ""
            : activePlaylistName
    );

    if (entered === null) return;

    const name = entered.trim();

    if (!name) {
        alert("Playlist name cannot be empty.");
        return;
    }

    playlists[name] = clone(currentPlaylist);
    activePlaylistName = name;

    renderSavedPlaylists();
    $("savedPlaylistSelect").value = name;

    updateActiveName();
    saveStorageNow();

    setSaveStatus(`Saved: ${name}`);
}

function loadNamedPlaylist() {
    const name = $("savedPlaylistSelect").value;

    if (!name || !playlists[name]) {
        alert("Select a saved playlist.");
        return;
    }

    currentPlaylist = clone(playlists[name]);
    activePlaylistName = name;
    selectedVideoId = null;

    if (currentPlaylist.length) {
        playVideo(currentPlaylist[0]);
    } else {
        currentVideoUrl = null;
        $("videoPlayer").src = "about:blank";
        $("playerTitle").textContent = "Select a video to play";
    }

    persistAndRender();
    setSaveStatus(`Loaded: ${name}`);
}

function newPlaylist() {
    if (currentPlaylist.length &&
        !confirm("Start a new playlist? Saved playlists will remain intact.")) {
        return;
    }

    currentPlaylist = [];
    activePlaylistName = "Untitled Playlist";
    selectedVideoId = null;
    currentVideoUrl = null;

    $("videoPlayer").src = "about:blank";
    $("playerTitle").textContent = "Select a video to play";

    persistAndRender();
}

function deleteNamedPlaylist() {
    const name = $("savedPlaylistSelect").value;

    if (!name || !playlists[name]) {
        alert("Select a saved playlist.");
        return;
    }

    if (!confirm(`Delete saved playlist "${name}"?`)) {
        return;
    }

    delete playlists[name];

    if (activePlaylistName === name) {
        activePlaylistName = "Untitled Playlist";
    }

    renderSavedPlaylists();
    updateActiveName();
    saveStorageNow();

    setSaveStatus(`Deleted: ${name}`);
}

/* =========================================================
   ACTIVE TAB VIDEO DETECTION
========================================================= */

function requestCurrentVideo() {
    chrome.tabs.query(
        { active: true, currentWindow: true },
        tabs => {
            const tab = tabs?.[0];

            if (!tab) {
                alert("No active tab.");
                return;
            }

            chrome.runtime.sendMessage(
                {
                    type: "GET_ACTIVE_VIDEO",
                    tabId: tab.id
                },
                response => {
                    if (chrome.runtime.lastError) {
                        alert("Could not detect video in active tab.");
                        console.warn(chrome.runtime.lastError.message);
                        return;
                    }

                    const url = response?.embedUrl ||
                               response?.url ||
                               response?.videoUrl;

                    if (url) {
                        addVideo(url, response.title || tab.title);
                    } else {
                        alert(
                            "No supported video detected.\n\n" +
                            "Open a supported video page first."
                        );
                    }
                }
            );
        }
    );
}

function handleDetectedVideo(message) {
    if (!message) return;

    const url = message.embedUrl ||
                message.url ||
                message.videoUrl;

    if (!url) return;

    currentVideoUrl = url;
    currentVideoTitle = message.title || "Detected Video";

    if (autoAdd && normalizeUrl(url) !== lastAutoAddedUrl) {
        lastAutoAddedUrl = normalizeUrl(url);
        addVideo(url, currentVideoTitle);
    }
}

/* =========================================================
   INITIALIZATION
========================================================= */

function initialize() {
    chrome.storage.local.get(
        Object.values(STORAGE),
        data => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                setSaveStatus("Storage unavailable");
                return;
            }

            playlists = data[STORAGE.playlists] || {};
            currentPlaylist = data[STORAGE.current] || [];
            activePlaylistName =
                data[STORAGE.activeName] || "Untitled Playlist";
            autoAdd = data[STORAGE.autoAdd] === true;

            $("autoAddToggle").checked = autoAdd;

            renderSavedPlaylists();
            renderPlaylist();
            updateActiveName();

            if (currentPlaylist.length) {
                playVideo(currentPlaylist[0]);
            }

            setSaveStatus("Ready");
        }
    );

    $("savePlaylistBtn").addEventListener("click", saveNamedPlaylist);
    $("loadPlaylistBtn").addEventListener("click", loadNamedPlaylist);
    $("newPlaylistBtn").addEventListener("click", newPlaylist);
    $("deletePlaylistBtn").addEventListener("click", deleteNamedPlaylist);
    $("addVideoBtn").addEventListener("click", requestCurrentVideo);
    $("clearPlaylistBtn").addEventListener("click", clearCurrentPlaylist);
    $("openVideoBtn").addEventListener("click", openVideoInTab);

    $("autoAddToggle").addEventListener("change", event => {
        autoAdd = event.target.checked;
        saveStorageNow();
    });

    chrome.runtime.onMessage.addListener(message => {
        if (
            message.type === "ACTIVE_VIDEO" ||
            message.type === "VIDEO_DETECTED"
        ) {
            handleDetectedVideo(message);
        }
    });

    // Request current active-tab video on sidebar startup.
    requestInitialVideo();

    window.addEventListener("beforeunload", () => {
        clearTimeout(saveTimer);
        saveStorageNow();
    });
}

function requestInitialVideo() {
    chrome.runtime.sendMessage(
        { type: "GET_ACTIVE_VIDEO" },
        response => {
            if (chrome.runtime.lastError) return;
            if (response) handleDetectedVideo(response);
        }
    );
}

document.addEventListener("DOMContentLoaded", initialize);
