// Options page script

const DEFAULT_SETTINGS = {
  enabled: true,
  targetFolderId: null,
  targetFolderPath: "Spam",
  autoScan: true,
  notifyOnMove: true,
  logActions: true,
  useMLClassifier: true,
  mlThreshold: 0.7,
  autoMoveThreshold: 0.99,
  scanDaysRange: 50
};

// DOM elements
const elements = {
  enabled: document.getElementById("enabled"),
  autoScan: document.getElementById("autoScan"),
  notifyOnMove: document.getElementById("notifyOnMove"),
  logActions: document.getElementById("logActions"),
  targetFolder: document.getElementById("targetFolder"),
  targetFolderPath: document.getElementById("targetFolderPath"),
  scannedCount: document.getElementById("scannedCount"),
  movedCount: document.getElementById("movedCount"),
  lastScanTime: document.getElementById("lastScanTime"),
  saveBtn: document.getElementById("saveBtn"),
  restoreBtn: document.getElementById("restoreBtn"),
  resetStats: document.getElementById("resetStats"),
  status: document.getElementById("status"),
  // ML elements
  useMLClassifier: document.getElementById("useMLClassifier"),
  mlThreshold: document.getElementById("mlThreshold"),
  autoMoveThreshold: document.getElementById("autoMoveThreshold"),
  scanDaysRange: document.getElementById("scanDaysRange"),
  vocabSize: document.getElementById("vocabSize"),
  trainingSize: document.getElementById("trainingSize"),
  spamSamples: document.getElementById("spamSamples"),
  hamSamples: document.getElementById("hamSamples"),
  trainingStatus: document.getElementById("trainingStatus"),
  retrainBtn: document.getElementById("retrainBtn"),
  trainFromFoldersBtn: document.getElementById("trainFromFoldersBtn")
};

let trainingPollInterval = null;

// Load settings and populate UI
async function loadSettings() {
  try {
    // Get settings and stats from background script
    const response = await browser.runtime.sendMessage({ action: "getSettings" });
    const { settings, stats } = response;

    // Populate form
    elements.enabled.checked = settings.enabled;
    elements.autoScan.checked = settings.autoScan;
    elements.notifyOnMove.checked = settings.notifyOnMove;
    elements.logActions.checked = settings.logActions;
    elements.targetFolderPath.value = settings.targetFolderPath || "Spam";

    // ML settings
    elements.useMLClassifier.checked = settings.useMLClassifier !== false;
    elements.mlThreshold.value = (settings.mlThreshold || 0.7).toString();
    elements.autoMoveThreshold.value = (settings.autoMoveThreshold || 0.99).toString();
    elements.scanDaysRange.value = (settings.scanDaysRange || 50).toString();

    // Load folders
    await loadFolders(settings.targetFolderId);

    // Update stats
    updateStats(stats);

    // Load classifier info
    await loadClassifierInfo();

  } catch (error) {
    console.error("Error loading settings:", error);
    showStatus("Error loading settings: " + error.message, "error");
  }
}

// Load classifier info
async function loadClassifierInfo() {
  try {
    const response = await browser.runtime.sendMessage({ action: "getClassifierInfo" });
    elements.vocabSize.textContent = response.vocabularySize || 0;
    elements.trainingSize.textContent = response.trainingSize || 0;

    // Show class distribution
    if (response.classDistribution) {
      elements.spamSamples.textContent = response.classDistribution.spam || 0;
      elements.hamSamples.textContent = response.classDistribution.ham || 0;
    }
  } catch (error) {
    console.error("Error loading classifier info:", error);
  }
}

// Load available folders
async function loadFolders(selectedFolderId) {
  try {
    const response = await browser.runtime.sendMessage({ action: "getFolders" });
    const { folders } = response;

    // Clear existing options (except first)
    while (elements.targetFolder.options.length > 1) {
      elements.targetFolder.remove(1);
    }

    // Add folder options
    for (const folder of folders) {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = `${folder.accountName} - ${folder.path}`;
      if (folder.id === selectedFolderId) {
        option.selected = true;
      }
      elements.targetFolder.appendChild(option);
    }

  } catch (error) {
    console.error("Error loading folders:", error);
  }
}

// Update statistics display
function updateStats(stats) {
  elements.scannedCount.textContent = stats.scannedCount || 0;
  elements.movedCount.textContent = stats.movedCount || 0;

  if (stats.lastScanTime) {
    const date = new Date(stats.lastScanTime);
    elements.lastScanTime.textContent = `Last scan: ${date.toLocaleString()}`;
  } else {
    elements.lastScanTime.textContent = "Last scan: Never";
  }
}

// Save settings
async function saveSettings() {
  try {
    const settings = {
      enabled: elements.enabled.checked,
      autoScan: elements.autoScan.checked,
      notifyOnMove: elements.notifyOnMove.checked,
      logActions: elements.logActions.checked,
      targetFolderId: elements.targetFolder.value || null,
      targetFolderPath: elements.targetFolderPath.value || "Spam",
      useMLClassifier: elements.useMLClassifier.checked,
      mlThreshold: parseFloat(elements.mlThreshold.value) || 0.7,
      autoMoveThreshold: parseFloat(elements.autoMoveThreshold.value) || 0.99,
      scanDaysRange: parseInt(elements.scanDaysRange.value) || 50
    };

    await browser.runtime.sendMessage({
      action: "saveSettings",
      settings: settings
    });

    showStatus("Settings saved successfully!", "success");

  } catch (error) {
    console.error("Error saving settings:", error);
    showStatus("Error saving settings: " + error.message, "error");
  }
}

// Restore default settings
async function restoreDefaults() {
  if (confirm("Are you sure you want to restore default settings?")) {
    try {
      await browser.runtime.sendMessage({
        action: "saveSettings",
        settings: DEFAULT_SETTINGS
      });

      await loadSettings();
      showStatus("Default settings restored!", "success");

    } catch (error) {
      console.error("Error restoring defaults:", error);
      showStatus("Error restoring defaults: " + error.message, "error");
    }
  }
}

// Reset statistics
async function resetStatistics() {
  if (confirm("Are you sure you want to reset statistics?")) {
    try {
      const response = await browser.runtime.sendMessage({ action: "resetStats" });
      updateStats(response.stats);
      showStatus("Statistics reset!", "success");

    } catch (error) {
      console.error("Error resetting stats:", error);
      showStatus("Error resetting statistics: " + error.message, "error");
    }
  }
}

// Retrain classifier with current data
async function retrainClassifier() {
  if (confirm("Retrain the ML classifier with current training data?")) {
    try {
      elements.trainingStatus.textContent = "Retraining...";
      await browser.runtime.sendMessage({ action: "retrainClassifier" });
      await loadClassifierInfo();
      elements.trainingStatus.textContent = "Retrained successfully!";
      showStatus("Classifier retrained successfully!", "success");
    } catch (error) {
      console.error("Error retraining classifier:", error);
      elements.trainingStatus.textContent = "Error: " + error.message;
      showStatus("Error retraining classifier: " + error.message, "error");
    }
  }
}

// Train from Spam/Inbox folders
async function trainFromFolders() {
  if (confirm("This will read emails from Spam/Junk folders (positive samples) and Inbox (negative samples) to train the classifier. Continue?")) {
    try {
      // Disable button
      elements.trainFromFoldersBtn.disabled = true;
      elements.trainFromFoldersBtn.textContent = "Training...";
      elements.trainingStatus.textContent = "Starting training...";

      // Start polling for progress
      startTrainingProgressPoll();

      // Start training
      const result = await browser.runtime.sendMessage({ action: "trainFromFolders" });

      // Stop polling
      stopTrainingProgressPoll();

      if (result.success) {
        elements.trainingStatus.textContent = `Complete! Spam: ${result.spamCount}, Ham: ${result.hamCount}`;
        showStatus(`Training complete! ${result.spamCount} spam + ${result.hamCount} ham samples`, "success");
        await loadClassifierInfo();
      } else {
        elements.trainingStatus.textContent = "Error: " + result.error;
        showStatus("Training failed: " + result.error, "error");
      }

    } catch (error) {
      console.error("Error training from folders:", error);
      stopTrainingProgressPoll();
      elements.trainingStatus.textContent = "Error: " + error.message;
      showStatus("Error training from folders: " + error.message, "error");
    } finally {
      elements.trainFromFoldersBtn.disabled = false;
      elements.trainFromFoldersBtn.textContent = "Train from Spam/Inbox Folders";
    }
  }
}

// Poll training progress
async function pollTrainingProgress() {
  try {
    const response = await browser.runtime.sendMessage({ action: "getTrainingProgress" });
    const { progress } = response;

    if (progress && progress.isTraining) {
      elements.trainingStatus.textContent = `${progress.status} (Spam: ${progress.spamCount}, Ham: ${progress.hamCount})`;
    }
  } catch (error) {
    console.error("Error polling training progress:", error);
  }
}

function startTrainingProgressPoll() {
  trainingPollInterval = setInterval(pollTrainingProgress, 500);
}

function stopTrainingProgressPoll() {
  if (trainingPollInterval) {
    clearInterval(trainingPollInterval);
    trainingPollInterval = null;
  }
}

// Show status message
function showStatus(message, type) {
  elements.status.textContent = message;
  elements.status.className = "status " + type;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    elements.status.className = "status";
  }, 3000);
}

// Event listeners
elements.saveBtn.addEventListener("click", saveSettings);
elements.restoreBtn.addEventListener("click", restoreDefaults);
elements.resetStats.addEventListener("click", resetStatistics);
elements.retrainBtn.addEventListener("click", retrainClassifier);
elements.trainFromFoldersBtn.addEventListener("click", trainFromFolders);

// Initialize
document.addEventListener("DOMContentLoaded", loadSettings);
