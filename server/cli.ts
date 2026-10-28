// One-off sync from the terminal: `npm run sync -- <username>`
import { db } from "./db.js";
import { runSyncNow, syncState } from "./sync.js";

const username = process.argv[2];
const user = db.prepare("SELECT id FROM user WHERE username = ?").get(username ?? "") as { id: number } | undefined;
if (!user) {
  console.error(`Usage: npm run sync -- <username>${username ? ` (no user "${username}")` : ""}`);
  process.exit(1);
}

const state = syncState(user.id);
const ticker = setInterval(() => state.step && console.log(state.step), 2000);
await runSyncNow(user.id);
clearInterval(ticker);
console.log(state.lastRun);
