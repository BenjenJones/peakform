// New password for a local account from the terminal, for when it is forgotten and no mail is set up:
//   npm run reset-password -- <username>                                          (from the repository)
//   docker compose exec -it peakform node dist/server/reset-password.js <username>  (in the container)
// Signs the account out everywhere. The Garmin key and all data stay.
// Also gives accounts from the Home Assistant app a password after moving to Docker; --rename drops
// their "ha." prefix: npm run reset-password -- ha.ben --rename ben
import { createInterface } from "node:readline";
import { db } from "./db.js";
import { config } from "./config.js";
import { MIN_PASSWORD, renameUser, setPassword, validateUsername } from "./users.js";

/** Reads a line without echoing it. */
function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    let muted = false;
    out._writeToOutput = (s) => {
      if (!muted || s.includes("\n")) process.stdout.write(muted ? "\n" : s);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

const USAGE = "Usage: npm run reset-password -- <username> [--rename <new username>]";
const args = process.argv.slice(2);
const ri = args.indexOf("--rename");
const rename = ri >= 0 ? args[ri + 1] : undefined;
const username = args.find((a, i) => !a.startsWith("--") && (ri < 0 || i !== ri + 1));
if (ri >= 0 && !rename) {
  console.error(USAGE);
  process.exit(1);
}

if (config.isHaApp) {
  console.error("In Home Assistant everyone signs in through Home Assistant; PeakForm has no passwords there.");
  process.exit(1);
}
const user = db.prepare("SELECT id, password_hash FROM user WHERE username = ?").get(username ?? "") as
  | { id: number; password_hash: string | null }
  | undefined;
if (!user) {
  const names = (db.prepare("SELECT username FROM user ORDER BY id").all() as { username: string }[]).map((u) => u.username);
  console.error(`${USAGE}${username ? `
No user "${username}".` : ""}${names.length ? ` Accounts: ${names.join(", ")}` : ""}`);
  process.exit(1);
}
// An account from the Home Assistant app (moved to Docker) has no password yet: this gives it one.
const fromHa = !user.password_hash;
if (rename) {
  try {
    validateUsername(rename, user.id);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
if (!process.stdin.isTTY) {
  console.error("Run this in a terminal (with docker: docker compose exec -it …), the password is read without echo.");
  process.exit(1);
}
if (fromHa) console.log(`"${username}" comes from Home Assistant. Choose a password to sign in with outside of it.`);

const pw = await ask("New password: ");
if (pw.length < MIN_PASSWORD) {
  console.error(`The password must be at least ${MIN_PASSWORD} characters.`);
  process.exit(1);
}
if ((await ask("Repeat it: ")) !== pw) {
  console.error("The passwords do not match.");
  process.exit(1);
}
if (rename) renameUser(user.id, rename);
await setPassword(user.id, pw);
const name = rename ?? username;
console.log(
  fromHa
    ? `"${name}" can now sign in with this password. The Garmin key and all data stay.`
    : `Password of "${name}" changed; all its sessions are signed out.`,
);
