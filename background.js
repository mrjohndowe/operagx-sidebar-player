
"use strict";

/*
 * Video Sidebar Background
 * - Detects supported video/embed URLs from tab URLs.
 * - Receives video detections from content scripts.
 * - Supplies the active video's URL to the sidebar.
 * - Supports Opera GX / Chromium Manifest V3.
 */

const detectedVideos = new Map();

const SUPPORTED_HOSTS = [
    "pornhub.com",
    "xvideos.com",
    "xfree.com",
    "xxxfollow.com"
];

function isSupportedHost(hostname) {
    hostname = hostname.toLowerCase();

    return SUPPORTED_HOSTS.some(host =>
        hostname === host || hostname.endsWith("." + host)
    );
}

function extractEmbedUrl(url) {
    if (!url) return null;

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        if (!isSupportedHost(host)) return null;

        // Pornhub embed URLs
        if (host.includes("pornhub.com")) {
            const embedMatch = parsed.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);

            if (embedMatch) {
                return `https://www.pornhub.com/embed/${embedMatch[1]}`;
            }

            // Convert Pornhub watch URL to embed URL
            const watchMatch = parsed.pathname.match(/\/view_video\.php/);
            const videoId = parsed.searchParams.get("viewkey");

            if (watchMatch && videoId) {
                return `https://www.pornhub.com/embed/${videoId}`;
            }
        }

        // XVideos embed URLs
        if (host.includes("xvideos.com")) {
            const embedMatch = parsed.pathname.match(/\/embedframe\/([a-zA-Z0-9_-]+)/);

            if (embedMatch) {
                return `https://www.xvideos.com/embedframe/${embedMatch[1]}`;
            }

            // Convert /video.ID/title to embedframe/ID
            const videoMatch = parsed.pathname.match(/\/video\.([a-zA-Z0-9_-]+)/);

            if (videoMatch) {
                return `https://www.xvideos.com/embedframe/${videoMatch[1]}`;
            }
        }

        // Other supported sites: preserve their supplied embed URLs
        if (parsed.pathname.includes("/embed") ||
            parsed.pathname.includes("/embedframe")) {
            return parsed.href;
        }

        return null;
    } catch {
        return null;
    }
}

function normalizeVideoMessage(message, tab) {
    if (!message) return null;

    const candidates = [
        message.embedUrl,
        message.url,
        message.videoUrl,
        message.src,
        message.iframeSrc
    ];

    let embedUrl = null;

    for (const candidate of candidates) {
        embedUrl = extractEmbedUrl(candidate);

        if (embedUrl) break;
    }

    // If content script reports a direct iframe URL, retain it.
    if (!embedUrl && message.embedUrl) {
        embedUrl = message.embedUrl;
    }

    if (!embedUrl) return null;

    return {
        url: embedUrl,
        embedUrl,
        title: message.title || tab?.title || "Detected Video",
        tabId: tab?.id ?? message.tabId ?? null,
        sourceUrl: tab?.url || message.sourceUrl || "",
        detectedAt: Date.now()
    };
}

function saveDetectedVideo(tabId, video) {
    if (tabId == null || !video) return;

    detectedVideos.set(tabId, video);
}

function getVideoForTab(tabId, tab) {
    const cached = detectedVideos.get(tabId);

    if (cached) return cached;

    const embedUrl = extractEmbedUrl(tab?.url);

    if (!embedUrl) return null;

    const video = {
        url: embedUrl,
        embedUrl,
        title: tab?.title || "Detected Video",
        tabId,
        sourceUrl: tab?.url || "",
        detectedAt: Date.now()
    };

    saveDetectedVideo(tabId, video);

    return video;
}

// Content scripts can send VIDEO_DETECTED or ACTIVE_VIDEO.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    if (
        message.type === "VIDEO_DETECTED" ||
        message.type === "ACTIVE_VIDEO"
    ) {
        const tab = sender.tab || null;
        const tabId = tab?.id ?? message.tabId;

        const video = normalizeVideoMessage(message, tab);

        if (video && tabId != null) {
            saveDetectedVideo(tabId, video);

            // Notify sidebar listeners.
            chrome.runtime.sendMessage({
                type: "ACTIVE_VIDEO",
                ...video
            }).catch(() => {});
        }

        sendResponse({
            success: Boolean(video),
            video
        });

        return true;
    }

    if (message.type === "GET_ACTIVE_VIDEO") {
        const requestedTabId = message.tabId;

        const respond = tab => {
            if (!tab) {
                sendResponse({ success: false, url: null });
                return;
            }

            const video = getVideoForTab(tab.id, tab);

            sendResponse(video
                ? { success: true, ...video }
                : { success: false, url: null }
            );
        };

        if (requestedTabId != null) {
            chrome.tabs.get(requestedTabId, tab => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, url: null });
                    return;
                }

                respond(tab);
            });
        } else {
            chrome.tabs.query(
                { active: true, currentWindow: true },
                tabs => respond(tabs?.[0] || null)
            );
        }

        return true;
    }

    if (message.type === "CLEAR_DETECTED_VIDEO") {
        const tabId = message.tabId ?? sender.tab?.id;

        if (tabId != null) {
            detectedVideos.delete(tabId);
        }

        sendResponse({ success: true });
        return true;
    }
});

// Detect when the user changes tabs.
chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, tab => {
        if (chrome.runtime.lastError || !tab) return;

        const video = getVideoForTab(tabId, tab);

        if (video) {
            chrome.runtime.sendMessage({
                type: "ACTIVE_VIDEO",
                ...video
            }).catch(() => {});
        }
    });
});

// Refresh cached URLs when tabs navigate.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        detectedVideos.delete(tabId);
    }

    if (changeInfo.status === "complete") {
        const video = getVideoForTab(tabId, tab);

        if (video) {
            chrome.runtime.sendMessage({
                type: "ACTIVE_VIDEO",
                ...video
            }).catch(() => {});
        }
    }
});

// Clean up removed tabs.
chrome.tabs.onRemoved.addListener(tabId => {
    detectedVideos.delete(tabId);
});
