(() => {
  if (window.__AVSC_V13_INSTALLED__) return;
  window.__AVSC_V13_INSTALLED__ = true;

  let selectedVideo = null;
  const videos = () => [...document.querySelectorAll("video")].filter(v => v.isConnected);
  const chooseVideo = () => {
    const list = videos();
    selectedVideo = list.find(v => !v.paused && v.readyState >= 2) ||
      list.sort((a,b) => (b.clientWidth*b.clientHeight) - (a.clientWidth*a.clientHeight))[0] || null;
    return selectedVideo;
  };
  const snap = () => {
    const v = chooseVideo();
    if (!v) return { found:false, title:document.title, url:location.href };
    return {
      found:true, title:document.title, url:location.href,
      paused:v.paused, currentTime:v.currentTime || 0, duration:Number.isFinite(v.duration)?v.duration:0,
      volume:v.volume, muted:v.muted, rate:v.playbackRate,
      videoWidth:v.videoWidth, videoHeight:v.videoHeight
    };
  };
  const reply = (sendResponse) => {
    try { sendResponse({ok:true, status:snap()}); } catch {}
  };
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "AVSC_STATUS") { reply(sendResponse); return true; }
    if (msg?.type !== "AVSC_COMMAND") return;
    const v = chooseVideo();
    if (!v) { sendResponse({ok:false,error:"No HTML5 video element was detected on this page."}); return; }
    try {
      switch (msg.command) {
        case "toggle": v.paused ? v.play().catch(()=>{}) : v.pause(); break;
        case "seek": v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + Number(msg.value||0))); break;
        case "volume": v.volume = Math.max(0, Math.min(1, Number(msg.value))); break;
        case "mute": v.muted = !v.muted; break;
        case "rate": v.playbackRate = Number(msg.value); break;
        case "fullscreen":
          if (document.fullscreenElement) document.exitFullscreen?.();
          else (v.requestFullscreen || v.webkitEnterFullscreen)?.call(v);
          break;
      }
      sendResponse({ok:true,status:snap()});
    } catch (e) { sendResponse({ok:false,error:e.message,status:snap()}); }
    return true;
  });
})();