import { buildBoard } from "./arrivals.js";
import { createBoard } from "./board.js";
import { createFeed } from "./feed.js";

// Wiring only. The feed produces snapshots, arrivals turns a snapshot into the
// board for right now, and board paints it. Nothing else belongs in this file.

const board = createBoard({
  getApiKey: () => feed.getApiKey(),
  onRefresh: () => feed.refresh(),
  onKeyChange: (apiKey) =>
    apiKey ? feed.setApiKey(apiKey) : feed.clearApiKey(),
});

const feed = createFeed({
  onSnapshot: (snapshot) =>
    snapshot
      ? board.render(buildBoard(snapshot))
      : board.showMessage("Failed to load data"),
  onStatus: (status) => board.setStatus(status),
});

feed.start();
