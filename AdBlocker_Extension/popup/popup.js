const toggle = document.getElementById("toggle");
const adsBlocked = document.getElementById("adCounter");

// Load saved state from Chrome storage
chrome.storage.sync.get("extensionEnabled", (data) => {
  toggle.checked = data.extensionEnabled !== undefined ? data.extensionEnabled : true;
});

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const response = await chrome.tabs.sendMessage(tabs[0].id, { action: "getCount" });
  adsBlocked.textContent = response?.adsBlocked || 0;
});

// Toggle the extension state
toggle.addEventListener("change", () => {
  // Save state in Chrome storage
  const extensionEnabled = toggle.checked;
  chrome.storage.sync.set({ extensionEnabled });

  // Notify the content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: extensionEnabled ? "start" : "stop" });
  });

  if (!extensionEnabled) adsBlocked.textContent = 0;

});

// Listen for updates to the ad counter
chrome.runtime.onMessage.addListener(({ action, count }) => {
  if (action === 'updateCounter') {
    adsBlocked.textContent = count;
  }
});