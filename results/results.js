// Results page script

let allResults = [];
let filteredResults = [];
let currentSort = { field: 'date', direction: 'desc' };

// DOM elements
const elements = {
  totalScanned: document.getElementById("totalScanned"),
  spamDetected: document.getElementById("spamDetected"),
  byHeader: document.getElementById("byHeader"),
  byML: document.getElementById("byML"),
  scanTime: document.getElementById("scanTime"),
  filterMethod: document.getElementById("filterMethod"),
  filterProbability: document.getElementById("filterProbability"),
  searchInput: document.getElementById("searchInput"),
  resultsBody: document.getElementById("resultsBody"),
  selectAll: document.getElementById("selectAll"),
  moveSelectedBtn: document.getElementById("moveSelectedBtn"),
  markSafeBtn: document.getElementById("markSafeBtn"),
  selectedCount: document.getElementById("selectedCount")
};

// Load results from storage
async function loadResults() {
  try {
    const data = await browser.storage.local.get("scanResults");
    if (data.scanResults) {
      allResults = data.scanResults.predictions || [];
      updateSummary(data.scanResults);
      applyFilters();
    } else {
      showEmptyState("No scan results found. Run a scan first.");
    }
  } catch (error) {
    console.error("Error loading results:", error);
    showEmptyState("Error loading results: " + error.message);
  }
}

// Update summary statistics
function updateSummary(results) {
  elements.totalScanned.textContent = results.totalScanned || 0;
  elements.spamDetected.textContent = results.predictions?.length || 0;
  elements.byHeader.textContent = results.predictions?.filter(p => p.method === "header").length || 0;
  elements.byML.textContent = results.predictions?.filter(p => p.method === "ml").length || 0;

  if (results.scanTime) {
    const date = new Date(results.scanTime);
    elements.scanTime.textContent = date.toLocaleString();
  }
}

// Apply filters and search
function applyFilters() {
  const methodFilter = elements.filterMethod.value;
  const probFilter = elements.filterProbability.value;
  const searchTerm = elements.searchInput.value.toLowerCase();

  filteredResults = allResults.filter(item => {
    // Method filter
    if (methodFilter !== "all" && item.method !== methodFilter) {
      return false;
    }

    // Probability filter
    if (probFilter === "high" && item.probability < 0.8) {
      return false;
    }
    if (probFilter === "medium" && (item.probability < 0.5 || item.probability >= 0.8)) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const subject = (item.subject || "").toLowerCase();
      const sender = (item.sender || "").toLowerCase();
      if (!subject.includes(searchTerm) && !sender.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  // Apply sorting
  sortResults();
  renderResults();
}

// Sort results
function sortResults() {
  const { field, direction } = currentSort;
  const multiplier = direction === 'asc' ? 1 : -1;

  filteredResults.sort((a, b) => {
    let valA, valB;

    switch (field) {
      case 'subject':
        valA = (a.subject || '').toLowerCase();
        valB = (b.subject || '').toLowerCase();
        return valA.localeCompare(valB) * multiplier;

      case 'sender':
        valA = (a.sender || '').toLowerCase();
        valB = (b.sender || '').toLowerCase();
        return valA.localeCompare(valB) * multiplier;

      case 'date':
        valA = a.date ? new Date(a.date).getTime() : 0;
        valB = b.date ? new Date(b.date).getTime() : 0;
        return (valA - valB) * multiplier;

      case 'probability':
        valA = a.probability || 0;
        valB = b.probability || 0;
        return (valA - valB) * multiplier;

      default:
        return 0;
    }
  });
}

// Handle sort click
function handleSortClick(field) {
  if (currentSort.field === field) {
    // Toggle direction
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    // New field, default to descending for date/probability, ascending for text
    currentSort.field = field;
    currentSort.direction = (field === 'date' || field === 'probability') ? 'desc' : 'asc';
  }

  // Update header styles
  updateSortHeaders();

  // Re-sort and render
  sortResults();
  renderResults();
}

// Update sort header styles
function updateSortHeaders() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === currentSort.field) {
      th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// Render results table
function renderResults() {
  if (filteredResults.length === 0) {
    showEmptyState("No spam detected! Your inbox is clean.");
    return;
  }

  const html = filteredResults.map((item, index) => {
    const probClass = item.probability >= 0.8 ? "high" :
                      item.probability >= 0.5 ? "medium" : "low";
    const probPercent = Math.round(item.probability * 100);

    const methodBadge = item.method === "header"
      ? '<span class="method-header">HEADER</span>'
      : '<span class="method-ml">ML</span>';

    const keywordsHtml = (item.topKeywords || [])
      .slice(0, 5)
      .map(k => `<span class="keyword">${escapeHtml(k.word)}</span>`)
      .join("");

    const statusBadge = item.status === "moved"
      ? '<span class="status-badge status-moved">Moved</span>'
      : item.status === "safe"
        ? '<span class="status-badge status-safe">Safe</span>'
        : "";

    const rowClass = item.status ? "row-moved" : "";

    return `
      <tr class="${rowClass}" data-index="${index}" data-message-id="${item.messageId}">
        <td class="checkbox-cell">
          <input type="checkbox" class="row-checkbox" data-index="${index}" ${item.status ? "disabled" : ""}>
        </td>
        <td>
          <div class="subject">${escapeHtml(item.subject || "(No subject)")}${statusBadge}</div>
          <div class="detection-method">${methodBadge}</div>
        </td>
        <td class="sender">${escapeHtml(item.sender || "Unknown")}</td>
        <td class="date">${formatDateFull(item.date)}</td>
        <td>
          <span class="probability ${probClass}">${probPercent}%</span>
        </td>
        <td>
          <div class="keywords">${keywordsHtml || "-"}</div>
        </td>
        <td class="actions">${!item.status ? `<button class="btn btn-move" data-action="move" data-index="${index}">Move</button><button class="btn btn-safe" data-action="safe" data-index="${index}">Safe</button>` : ""}<button class="btn btn-view" data-action="view" data-index="${index}">View</button></td>
      </tr>
    `;
  }).join("");

  elements.resultsBody.innerHTML = html;
  updateSelectedCount();
}

// Show empty state
function showEmptyState(message) {
  elements.resultsBody.innerHTML = `
    <tr>
      <td colspan="7" class="empty-state">
        <h2>All Clear!</h2>
        <p>${escapeHtml(message)}</p>
      </td>
    </tr>
  `;
}

// Format date for display (full format for sorting visibility)
function formatDateFull(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Show toast notification
function showToast(message, type = "success") {
  // Remove existing toast
  const existingToast = document.querySelector(".toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.classList.add("toast-fade");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Move single message to spam
async function moveToSpam(index) {
  const item = filteredResults[index];
  if (!item || item.status) return;

  // Disable button while processing
  const btn = document.querySelector(`tr[data-index="${index}"] .btn-move`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Moving...";
  }

  try {
    const result = await browser.runtime.sendMessage({
      action: "moveMessage",
      messageId: item.messageId
    });

    if (result && result.success) {
      item.status = "moved";
      updateResultInStorage(item);
      renderResults();
      showToast("Message moved to spam folder", "success");
    } else {
      const errorMsg = result?.error || "Unknown error";
      console.error("Failed to move message:", errorMsg);
      showToast("Failed to move: " + errorMsg, "error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Move";
      }
    }
  } catch (error) {
    console.error("Error moving message:", error);
    showToast("Error moving message: " + error.message, "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Move";
    }
  }
}

// Mark single message as safe
async function markSafe(index) {
  const item = filteredResults[index];
  if (!item || item.status) return;

  // Disable button while processing
  const btn = document.querySelector(`tr[data-index="${index}"] .btn-safe`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Marking...";
  }

  item.status = "safe";
  updateResultInStorage(item);
  renderResults();
  showToast("Message marked as safe", "success");

  // Optionally add to training data as ham
  try {
    await browser.runtime.sendMessage({
      action: "addTrainingData",
      text: item.subject + " " + (item.bodyPreview || ""),
      label: "ham"
    });
  } catch (error) {
    console.error("Error adding training data:", error);
  }
}

// View message - open in Thunderbird
async function viewMessage(index) {
  const item = filteredResults[index];
  if (!item) return;

  // Disable button while processing
  const btn = document.querySelector(`tr[data-index="${index}"] .btn-view`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Opening...";
  }

  try {
    const result = await browser.runtime.sendMessage({
      action: "viewMessage",
      messageId: item.messageId
    });

    if (result.success) {
      showToast("Message opened in Thunderbird", "success");
    } else {
      console.error("Failed to view message:", result.error);
      showToast("Could not open message: " + (result.error || "Unknown error"), "error");
    }
  } catch (error) {
    console.error("Error viewing message:", error);
    showToast("Error opening message: " + error.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "View";
    }
  }
}

// Update result in storage
async function updateResultInStorage(updatedItem) {
  try {
    const data = await browser.storage.local.get("scanResults");
    if (data.scanResults && data.scanResults.predictions) {
      const idx = data.scanResults.predictions.findIndex(
        p => p.messageId === updatedItem.messageId
      );
      if (idx >= 0) {
        data.scanResults.predictions[idx] = updatedItem;
        await browser.storage.local.set({ scanResults: data.scanResults });
      }
    }
  } catch (error) {
    console.error("Error updating storage:", error);
  }
}

// Get selected items
function getSelectedItems() {
  const checkboxes = document.querySelectorAll(".row-checkbox:checked");
  return Array.from(checkboxes).map(cb => {
    const index = parseInt(cb.dataset.index);
    return filteredResults[index];
  }).filter(item => item && !item.status);
}

// Update selected count
function updateSelectedCount() {
  const selected = getSelectedItems();
  elements.selectedCount.textContent = `${selected.length} selected`;
}

// Move selected to spam
async function moveSelected() {
  const selected = getSelectedItems();
  if (selected.length === 0) {
    showToast("No messages selected", "error");
    return;
  }

  if (!confirm(`Move ${selected.length} messages to spam?`)) {
    return;
  }

  // Disable button while processing
  elements.moveSelectedBtn.disabled = true;
  elements.moveSelectedBtn.textContent = "Moving...";

  let successCount = 0;
  let errorCount = 0;

  for (const item of selected) {
    try {
      await browser.runtime.sendMessage({
        action: "moveMessage",
        messageId: item.messageId
      });
      item.status = "moved";
      updateResultInStorage(item);
      successCount++;
    } catch (error) {
      console.error("Error moving message:", error);
      errorCount++;
    }
  }

  elements.moveSelectedBtn.disabled = false;
  elements.moveSelectedBtn.textContent = "Move Selected to Spam";

  renderResults();

  if (errorCount === 0) {
    showToast(`${successCount} messages moved to spam`, "success");
  } else {
    showToast(`Moved ${successCount}, failed ${errorCount}`, "error");
  }
}

// Mark selected as safe
async function markSelectedSafe() {
  const selected = getSelectedItems();
  if (selected.length === 0) {
    showToast("No messages selected", "error");
    return;
  }

  // Disable button while processing
  elements.markSafeBtn.disabled = true;
  elements.markSafeBtn.textContent = "Marking...";

  let successCount = 0;

  for (const item of selected) {
    item.status = "safe";
    updateResultInStorage(item);
    successCount++;

    // Add to training data
    try {
      await browser.runtime.sendMessage({
        action: "addTrainingData",
        text: item.subject + " " + (item.bodyPreview || ""),
        label: "ham"
      });
    } catch (error) {
      console.error("Error adding training data:", error);
    }
  }

  elements.markSafeBtn.disabled = false;
  elements.markSafeBtn.textContent = "Mark Selected as Safe";

  renderResults();
  showToast(`${successCount} messages marked as safe`, "success");
}

// Event listeners
elements.filterMethod.addEventListener("change", applyFilters);
elements.filterProbability.addEventListener("change", applyFilters);
elements.searchInput.addEventListener("input", applyFilters);

elements.selectAll.addEventListener("change", (e) => {
  const checkboxes = document.querySelectorAll(".row-checkbox:not(:disabled)");
  checkboxes.forEach(cb => cb.checked = e.target.checked);
  updateSelectedCount();
});

elements.resultsBody.addEventListener("change", (e) => {
  if (e.target.classList.contains("row-checkbox")) {
    updateSelectedCount();
  }
});

// Event delegation for action buttons (Move, Safe, View)
elements.resultsBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const index = parseInt(btn.dataset.index);

  if (action === "move") {
    moveToSpam(index);
  } else if (action === "safe") {
    markSafe(index);
  } else if (action === "view") {
    viewMessage(index);
  }
});

elements.moveSelectedBtn.addEventListener("click", moveSelected);
elements.markSafeBtn.addEventListener("click", markSelectedSafe);

// Sort header click listeners
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    handleSortClick(th.dataset.sort);
  });
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadResults();
  updateSortHeaders();
});
