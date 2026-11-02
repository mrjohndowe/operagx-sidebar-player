
"use strict";

const STORAGE_KEYS = {
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

const $ = (id) => document.getElementById(id);

function createId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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

function setSaveStatus(message) {
    $("saveStatus").textContent = message;
}

function updateStatus(active = true) {
    $("statusDot").classList.toggle("inactive", !active);
}

function saveStorage() {
    clearTimeout(saveTimer);
    setSaveStatus("Saving...");

    saveTimer = setTimeout(() => {
        chrome.storage.local.set({
            [STORAGE_KEYS.playlists]: playlists,
            [STORAGE_KEYS.current]: currentPlaylist,
            [STORAGE_KEYS.activeName]: activePlaylistName,
            [STORAGE_KEYS.autoAdd]: autoAdd
        }, () => {
            if (chrome.runtime.lastError) {
                setSaveStatus("Save failed");
                console.error(chrome.runtime.lastError);
                return;
            }
            setSaveStatus("All changes saved");
        });
    }, 150);
}

function updateActiveName() {
    $("activePlaylistName").textContent = activePlaylistName;
}

function renderSavedPlaylists() {
    const select = $("savedPlaylistSelect");
    const previousValue = select.value;

    select.innerHTML = "";

    const names = Object.keys(playlists).sort((a, b) => a.localeCompare(b));

    if (names.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No saved playlists";
        select.appendChild(option);
    } else {
        for (const name of names) {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        }

        if (names.includes(previousValue)) {
            select.value = previousValue;
        } else if (names.includes(activePlaylistName)) {
            select.value = activePlaylistName;
        }
    }

    $("deletePlaylistBtn").disabled = names.length === 0;
    $("loadPlaylistBtn").disabled = names.length === 0;
}

function renderPlaylist() {
    const container = $("playlistItems");
    container.innerHTML = "";

    $("playlistCount").textContent =
        `${currentPlaylist.length} video${currentPlaylist.length === 1 ? "" : "s"}`;

    if (currentPlaylist.length === 0) {
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

        const playButton = document.createElement("button");
        playButton.className = "playlist-play";
        playButton.title = "Play video";
        playButton.textContent = "▶";
        playButton.addEventListener("click", () => playVideo(video));

        const info = document.createElement("div");
        info.className = "playlist-info";

        const title = document.createElement("div");
        title.className = "playlist-item-title";
        title.textContent = video.title || `Video ${index + 1}`;
        title.title = video.title || video.url;

        const url = document.createElement("div");
        url.className = "playlist-item-url";
        url.textContent = video.url;
        url.title = video.url;

        info.append(title, url);
        info.addEventListener("click", () => playVideo(video));

        const removeButton = document.createElement("button");
        removeButton.className = "playlist-remove";
        removeButton.title = "Remove video";
        removeButton.textContent = "×";
        removeButton.addEventListener("click", () => removeVideo(video.id));

        item.append(playButton, info, removeButton);
        container.appendChild(item);
    });
}

function persistAndRender() {
    renderPlaylist();
    updateActiveName();
    saveStorage();
}

function addVideo(url, title = "Untitled Video") {
    if (!url || !/^https?:\/\//i.test(url)) {
        alert("No valid video URL was detected.");
        return;
    }

    const normalized = normalizeUrl(url);

    const existing = currentPlaylist.find(
        video => normalizeUrl(video.url) === normalized
    );

    if (existing) {
        playVideo(existing);
        setSaveStatus("Video already in playlist");
        return;
    }

    const video = {
        id: createId(),
        url,
        title: title || "Untitled Video",
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

function playVideo(video) {
    if (!video || !video.url) return;

    selectedVideoId = video.id;
    currentVideoUrl = video.url;
    currentVideoTitle = video.title;

    $("videoPlayer").src = video.url;
    $("playerTitle").textContent = video.title || video.url;

    renderPlaylist();
}

function saveNamedPlaylist() {
    const defaultName = activePlaylistName === "Untitled Playlist"
        ? ""
        : activePlaylistName;

    const enteredName = prompt("Enter a name for this playlist:", defaultName);

    if (enteredName === null) return;

    const name = enteredName.trim();

    if (!name) {
        alert("Please enter a playlist name.");
        return;
    }

    playlists[name] = JSON.parse(JSON.stringify(currentPlaylist));
    activePlaylistName = name;

    renderSavedPlaylists();
    $("savedPlaylistSelect").value = name;

    updateActiveName();
    saveStorage();
    setSaveStatus(`Saved "${name}"`);
}

function loadNamedPlaylist() {
    const name = $("savedPlaylistSelect").value;

    if (!name || !Object.prototype.hasOwnProperty.call(playlists, name)) {
        alert("Select a saved playlist first.");
        return;
    }

    currentPlaylist = JSON.parse(JSON.stringify(playlists[name]));
    activePlaylistName = name;
    selectedVideoId = null;

    if (currentPlaylist.length > 0) {
        playVideo(currentPlaylist[0]);
    } else {
        $("videoPlayer").src = "about:blank";
        $("playerTitle").textContent = "Select a video to play";
    }

    persistAndRender();
    setSaveStatus(`Loaded "${name}"`);
}

function newPlaylist() {
    const proceed = currentPlaylist.length === 0 ||
        confirm("Start a new playlist? Your current playlist will remain saved.");

    if (!proceed) return;

    currentPlaylist = [];
    selectedVideoId = null;
    activePlaylistName = "Untitled Playlist";

    $("videoPlayer").src = "about:blank";
    $("playerTitle").textContent = "Select a video to play";

    persistAndRender();
}

function deleteNamedPlaylist() {
    const name = $("savedPlaylistSelect").value;

    if (!name || !Object.prototype.hasOwnProperty.call(playlists, name)) {
        alert("Select a saved playlist first.");
        return;
    }

    if (!confirm(`Permanently delete "${name}"?`)) return;

    delete playlists[name];

    if (activePlaylistName === name) {
        activePlaylistName = "Untitled Playlist";
    }

    renderSavedPlaylists();
    updateActiveName();
    saveStorage();
    setSaveStatus(`Deleted "${name}"`);
}

function clearCurrentPlaylist() {
    if (currentPlaylist.length === 0) return;

    if (!confirm("Clear all videos from the active playlist?")) return;

    currentPlaylist = [];
    selectedVideoId = null;

    $("videoPlayer").src = "about:blank";
    $("playerTitle").textContent = "Select a video to play";

    persistAndRender();
}

function getActiveTab() {
    return new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            resolve(tabs && tabs.length ? tabs[0] : null);
        });
    });
}

async function requestCurrentVideo() {
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
        alert("Could not find the active browser tab.");
        return;
    }

    chrome.runtime.sendMessage(
        { type: "GET_ACTIVE_VIDEO", tabId: tab.id },
        response => {
            if (chrome.runtime.lastError) {
                console.warn(chrome.runtime.lastError.message);
                alert("Could not retrieve video from the active tab.");
                return;
            }

            if (response && response.url) {
                addVideo(response.url, response.title || tab.title || "Video");
            } else if (response && response.videoUrl) {
                addVideo(response.videoUrl, response.title || tab.title || "Video");
            } else {
                alert("No supported video was detected in the active tab.");
            }
        }
    );
}

function handleDetectedVideo(message) {
    if (!message) return;

    const url = message.url || message.videoUrl || message.embedUrl;
    const title = message.title || "Detected Video";

    if (!url) return;

    currentVideoUrl = url;
    currentVideoTitle = title;
    updateStatus(true);

    if (autoAdd && normalizeUrl(url) !== lastAutoAddedUrl) {
        lastAutoAddedUrl = normalizeUrl(url);
        addVideo(url, title);
    }
}

function openVideoInTab() {
    if (!currentVideoUrl) {
        alert("Select a video first.");
        return;
    }

    chrome.tabs.create({ url: currentVideoUrl });
}

function initialize() {
    chrome.storage.local.get(
        [
            STORAGE_KEYS.playlists,
            STORAGE_KEYS.current,
            STORAGE_KEYS.activeName,
            STORAGE_KEYS.autoAdd
        ],
        data => {
            playlists = data[STORAGE_KEYS.playlists] || {};
            currentPlaylist = data[STORAGE_KEYS.current] || [];
            activePlaylistName = data[STORAGE_KEYS.activeName] || "Untitled Playlist";
            autoAdd = data[STORAGE_KEYS.autoAdd] === true;

            $("autoAddToggle").checked = autoAdd;

            renderSavedPlaylists();
            renderPlaylist();
            updateActiveName();

            // Resume the last selected video if it still exists.
            if (currentPlaylist.length > 0) {
                playVideo(currentPlaylist[0]);
            }

            saveStorage();
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
        saveStorage();
    });

    // Receive detected videos from the background script.
    chrome.runtime.onMessage.addListener(message => {
        if (message.type === "ACTIVE_VIDEO" || message.type === "VIDEO_DETECTED") {
            handleDetectedVideo(message);
        }
    });

    // Ask the background script for the current tab's video.
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_VIDEO" }, response => {
        if (chrome.runtime.lastError) return;
        if (response) handleDetectedVideo(response);
    });

    updateStatus(true);
}

document.addEventListener("DOMContentLoaded", initialize);
