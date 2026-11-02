
function extractVideo(urlString) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.replace(/^www\./, "");

    // PORNHUB
    if (host === "pornhub.com") {
      if (url.pathname.startsWith("/embed/")) {
        return url.href;
      }

      const id = url.searchParams.get("viewkey");

      if (id) {
        return `https://www.pornhub.com/embed/${encodeURIComponent(id)}`;
      }
    }

    // XVIDEOS
    if (host === "xvideos.com") {
      const match = url.pathname.match(
        /\/video\.([a-zA-Z0-9]+)/
      );

      if (match) {
        return `https://www.xvideos.com/embedframe/${match[1]}`;
      }
    }

    // XFREE AND XXXFOLLOW:
    // Their embed URL patterns need to be confirmed
    // from actual video page URLs.

    return null;
  } catch {
    return null;
  }
}

async function getActiveVideo() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  const tab = tabs[0];

  if (!tab) return null;

  return {
    tabId: tab.id,
    url: tab.url || "",
    title: tab.title || "",
    embed: extractVideo(tab.url || "")
  };
}

chrome.tabs.onActivated.addListener(async () => {
  const data = await getActiveVideo();

  if (data) {
    chrome.runtime.sendMessage({
      type: "ACTIVE_VIDEO",
      data
    }).catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    if (tab.active) {
      const data = await getActiveVideo();

      if (data) {
        chrome.runtime.sendMessage({
          type: "ACTIVE_VIDEO",
          data
        }).catch(() => {});
      }
    }
  }
});

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (message.type === "GET_ACTIVE_VIDEO") {
      getActiveVideo().then(sendResponse);
      return true;
    }

  }
);
