// The screen. This module owns every element id, every piece of markup, the
// icons, the busy and status affordances, and the API key dialog.
//
// Callers hand it a board object and get pixels; they never touch the DOM. In
// return this module knows nothing about where arrivals came from — it cannot
// fetch, poll, or read the clock.

const refreshIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
    <path d="M21 3v6h-6"/>
  </svg>
`.trim();

const keyIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m15.5 7.5 3 3L22 7l-3-3"/>
    <path d="m21 2-9.6 9.6"/>
    <circle cx="7.5" cy="15.5" r="5.5"/>
  </svg>
`.trim();

// The countdown is what you read from three feet away, so it carries the weight.
// "Now" and "—" are words rather than figures, and get sized down accordingly.
function etaHTML(arrival) {
  if (!arrival.hasEstimate) {
    return `<span class="eta__num eta__num--word">&mdash;</span>`;
  }
  if (arrival.minutes <= 0) {
    return `<span class="eta__num eta__num--word">Now</span>`;
  }
  return `
    <span class="eta__num">${arrival.minutes}</span>
    <span class="eta__unit">min</span>
  `;
}

function rowHTML(arrival) {
  return `
    <li class="row" data-soon="${arrival.soon}" data-stale="${!arrival.hasEstimate}">
      <span class="plate" style="background-color: ${arrival.lineColor}">${arrival.line}</span>
      <span class="dest">
        <span class="dest__name">${arrival.destination}</span>
      </span>
      <span class="eta">${etaHTML(arrival)}</span>
    </li>
  `;
}

// The header answers "board here, and it takes you there": the stop name, a
// track that stretches across whatever space is left, then the destination.
function groupHTML(group, destination) {
  return `
    <li class="group">
      <div class="group__head">
        <h2 class="stop-name">${group.stopName}</h2>
        <span class="track" aria-hidden="true">
          <span class="track__dot"></span>
          <span class="track__line"></span>
          <span class="track__head"></span>
        </span>
        <span class="sr-only">to</span>
        <span class="dest-name">${destination}</span>
      </div>
      <ul class="rows">
        ${group.arrivals.map(rowHTML).join("")}
      </ul>
    </li>
  `;
}

// onRefresh runs while the Update button shows a spinner; onKeyChange receives a
// key string to save, or null to remove the saved key.
export function createBoard({ getApiKey, onRefresh, onKeyChange }) {
  const arrivalsListEl = document.getElementById("arrivals-list");
  const lastUpdatedEl = document.getElementById("last-updated");
  const apiKeyStatusEl = document.getElementById("api-key-status");
  const refreshBtn = document.getElementById("api-refresh-btn");
  const keyBtn = document.getElementById("key-btn");
  const keyDialog = document.getElementById("key-dialog");
  const apiKeyInput = document.getElementById("api-key-input");
  const removeKeyBtn = document.getElementById("remove-api-key");

  refreshBtn.innerHTML = `${refreshIcon}<span>Update</span>`;
  keyBtn.innerHTML = keyIcon;

  // Whether a refresh is possible at all — a refresh in flight disables the
  // button too, and this is what it goes back to afterwards.
  let canRefresh = false;

  // Reflect key state in the status dot and the Update button. Details that used
  // to need their own paragraph now live in the dot's tooltip.
  function setStatus(status) {
    apiKeyStatusEl.dataset.state = status.state;
    apiKeyStatusEl.title = status.message;
    canRefresh = status.canRefresh;
    refreshBtn.disabled = !canRefresh;
  }

  function setBusy(busy) {
    if (busy) {
      refreshBtn.dataset.busy = "true";
      refreshBtn.disabled = true;
    } else {
      delete refreshBtn.dataset.busy;
      refreshBtn.disabled = !canRefresh;
    }
  }

  refreshBtn.addEventListener("click", async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  });

  keyBtn.addEventListener("click", () => {
    apiKeyInput.value = getApiKey() || "";
    removeKeyBtn.hidden = !getApiKey();
    keyDialog.showModal();
  });

  keyDialog.addEventListener("close", () => {
    const apiKey = apiKeyInput.value.trim();

    if (keyDialog.returnValue === "save") {
      if (apiKey) {
        onKeyChange(apiKey);
      } else {
        setStatus({
          state: "error",
          message: "Please enter a valid API key",
          canRefresh,
        });
      }
      return;
    }

    if (keyDialog.returnValue === "remove") {
      apiKeyInput.value = "";
      onKeyChange(null);
    }
  });

  return {
    setStatus,

    render(board) {
      if (board.lastUpdated) {
        const lastUpdated = new Date(board.lastUpdated);
        lastUpdatedEl.textContent = `Updated ${lastUpdated.toLocaleTimeString()}`;
        // The source is a debugging detail, so it rides in the tooltip rather
        // than competing with the arrivals.
        lastUpdatedEl.title = `Source: ${board.source}`;
      }

      arrivalsListEl.innerHTML = board.groups.length
        ? board.groups
            .map((group) => groupHTML(group, board.destination))
            .join("")
        : `<p>${board.emptyMessage}</p>`;
    },

    showMessage(message) {
      arrivalsListEl.innerHTML = `<p>${message}</p>`;
    },
  };
}
