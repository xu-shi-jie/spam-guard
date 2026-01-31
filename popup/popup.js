// Popup script

const elements = {
  statusIndicator: document.getElementById("statusIndicator"),
  enableToggle: document.getElementById("enableToggle"),
  scannedCount: document.getElementById("scannedCount"),
  movedCount: document.getElementById("movedCount"),
  lastScan: document.getElementById("lastScan"),
  scanAllBtn: document.getElementById("scanAllBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  resultMessage: document.getElementById("resultMessage"),
  // Progress elements
  progressContainer: document.getElementById("progressContainer"),
  progressStats: document.getElementById("progressStats"),
  progressBar: document.getElementById("progressBar"),
  progressFolder: document.getElementById("progressFolder"),
  progressScanned: document.getElementById("progressScanned"),
  progressMoved: document.getElementById("progressMoved"),
  // Scan options
  accountSelect: document.getElementById("accountSelect"),
  scanRange: document.getElementById("scanRange")
};

let progressInterval = null;

// Load accounts list
async function loadAccounts() {
  try {
    const response = await browser.runtime.sendMessage({ action: "getAccounts" });
    const { accounts } = response;

    // Clear existing options except "All Accounts"
    elements.accountSelect.innerHTML = '<option value="all">All Accounts</option>';

    // Add each account
    if (accounts && accounts.length > 0) {
      accounts.forEach(account => {
        const option = document.createElement("option");
        option.value = account.id;
        option.textContent = account.name || account.id;
        elements.accountSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error loading accounts:", error);
  }
}

// Load current status
async function loadStatus() {
  try {
    const response = await browser.runtime.sendMessage({ action: "getSettings" });
    const { settings, stats } = response;

    // Update toggle
    elements.enableToggle.checked = settings.enabled;
    updateStatusIndicator(settings.enabled);

    // Update stats
    elements.scannedCount.textContent = stats.scannedCount || 0;
    elements.movedCount.textContent = stats.movedCount || 0;

    if (stats.lastScanTime) {
      const date = new Date(stats.lastScanTime);
      elements.lastScan.textContent = formatTime(date);
    } else {
      elements.lastScan.textContent = "Never";
    }

    // Set scan range from settings
    if (settings.scanDaysRange && elements.scanRange) {
      elements.scanRange.value = settings.scanDaysRange.toString();
    }

    // Load accounts
    await loadAccounts();

  } catch (error) {
    console.error("Error loading status:", error);
  }
}

// Format time for display
function formatTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

// Update status indicator
function updateStatusIndicator(enabled) {
  if (enabled) {
    elements.statusIndicator.classList.add("active");
  } else {
    elements.statusIndicator.classList.remove("active");
  }
}

// Toggle enable/disable
async function toggleEnabled() {
  try {
    const response = await browser.runtime.sendMessage({ action: "toggle" });
    updateStatusIndicator(response.enabled);
  } catch (error) {
    console.error("Error toggling:", error);
  }
}

// Show progress bar
function showProgress() {
  elements.progressContainer.classList.add("show");
  elements.progressBar.style.width = "0%";
  elements.progressBar.classList.add("indeterminate");
  elements.progressStats.textContent = "0%";
  elements.progressFolder.textContent = "Preparing...";
  elements.progressScanned.textContent = "0";
  elements.progressMoved.textContent = "0";
}

// Hide progress bar
function hideProgress() {
  elements.progressContainer.classList.remove("show");
  elements.progressBar.classList.remove("indeterminate");
}

// Update progress display
function updateProgress(progress) {
  if (!progress.isScanning) {
    return false;
  }

  // Calculate percentage based on folders (rough estimate)
  let percent = 0;
  if (progress.totalFolders > 0) {
    percent = Math.min(99, Math.round((progress.currentFolderIndex / progress.totalFolders) * 100));
  }

  elements.progressBar.classList.remove("indeterminate");
  elements.progressBar.style.width = percent + "%";
  elements.progressStats.textContent = percent + "%";
  elements.progressFolder.textContent = progress.currentFolder || "Scanning...";
  elements.progressScanned.textContent = progress.scannedCount || 0;
  elements.progressMoved.textContent = progress.movedCount || 0;

  return true;
}

// Poll for progress updates
async function pollProgress() {
  try {
    const response = await browser.runtime.sendMessage({ action: "getProgress" });
    const { progress } = response;

    if (progress && progress.isScanning) {
      updateProgress(progress);
    } else {
      // Scanning complete
      stopProgressPolling();
      elements.progressBar.style.width = "100%";
      elements.progressStats.textContent = "100%";
      elements.progressFolder.textContent = "Complete!";

      // Hide after a short delay
      setTimeout(() => {
        hideProgress();
      }, 1000);
    }
  } catch (error) {
    console.error("Error polling progress:", error);
  }
}

// Start polling for progress
function startProgressPolling() {
  showProgress();
  progressInterval = setInterval(pollProgress, 300);
}

// Stop polling for progress
function stopProgressPolling() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

// Scan inboxes with progress
async function scanAll() {
  elements.scanAllBtn.classList.add("loading");
  elements.scanAllBtn.disabled = true;

  // Get selected options
  const daysRange = parseInt(elements.scanRange.value) || 50;
  const accountId = elements.accountSelect.value;

  // Start progress polling
  startProgressPolling();

  try {
    const response = await browser.runtime.sendMessage({
      action: "scanAll",
      daysRange: daysRange === 0 ? null : daysRange,
      accountId: accountId === "all" ? null : accountId
    });
    const { result } = response;

    // Stop polling and show final result
    stopProgressPolling();

    // Show 100% complete
    elements.progressBar.style.width = "100%";
    elements.progressStats.textContent = "100%";
    elements.progressFolder.textContent = "Complete!";
    elements.progressScanned.textContent = result.scanned;
    elements.progressMoved.textContent = result.moved;

    // Hide progress after delay and show result
    setTimeout(() => {
      hideProgress();
      showResult(`Scanned ${result.scanned} messages, found ${result.moved} spam`, "success");
    }, 1500);

    // Refresh stats
    await loadStatus();

  } catch (error) {
    console.error("Error scanning:", error);
    stopProgressPolling();
    hideProgress();
    showResult("Error scanning messages", "error");
  } finally {
    elements.scanAllBtn.classList.remove("loading");
    elements.scanAllBtn.disabled = false;
  }
}

// Show result message
function showResult(message, type) {
  elements.resultMessage.textContent = message;
  elements.resultMessage.className = "result-message show " + type;

  setTimeout(() => {
    elements.resultMessage.classList.remove("show");
  }, 5000);
}

// Open options page
function openOptions(e) {
  e.preventDefault();
  browser.runtime.openOptionsPage();
  window.close();
}

// Save scan range when changed
async function saveScanRange() {
  const daysRange = parseInt(elements.scanRange.value) || 50;
  try {
    await browser.runtime.sendMessage({
      action: "saveSettings",
      settings: { scanDaysRange: daysRange }
    });
  } catch (error) {
    console.error("Error saving scan range:", error);
  }
}

// Event listeners
elements.enableToggle.addEventListener("change", toggleEnabled);
elements.scanAllBtn.addEventListener("click", scanAll);
elements.settingsBtn.addEventListener("click", openOptions);
elements.scanRange.addEventListener("change", saveScanRange);

// Cleanup on popup close
window.addEventListener("unload", () => {
  stopProgressPolling();
});

// Initialize
document.addEventListener("DOMContentLoaded", loadStatus);
