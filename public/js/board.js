// The screen. This module owns every element id, every piece of markup, the
// icons, the busy and status affordances, and the API key dialog.
//
// Callers hand it a board object and get pixels; they never touch the DOM. In
// return this module knows nothing about where arrivals came from — it cannot
// fetch, poll, or read the clock.

const refreshIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
  </svg>
`.trim();

const keyIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/>
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>
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
          <span class="track__dot">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 6v6"/>
              <path d="M15 6v6"/>
              <path d="M2 12h19.6"/>
              <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
              <circle cx="7" cy="18" r="2"/>
              <path d="M9 18h5"/>
              <circle cx="16" cy="18" r="2"/>
            </svg>
          </span>
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
            .slice()
            // Reverse alphabetical by stop name.
            .sort((a, b) => b.stopName.localeCompare(a.stopName))
            .map((group) => groupHTML(group, board.destination))
            .join("")
        : `<p>${board.emptyMessage}</p>`;
    },

    showMessage(message) {
      arrivalsListEl.innerHTML = `<p>${message}</p>`;
    },
  };
}
