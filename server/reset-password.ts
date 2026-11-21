// New password for a local account from the terminal, for when it is forgotten and no mail is set up:
//   npm run reset-password -- <username>                                          (from the repository)
//   docker compose exec -it peakform node dist/server/reset-password.js <username>  (in the container)
// Signs the account out everywhere. The Garmin key and all data stay.
import { createInterface } from "node:readline";
import { db } from "./db.js";
import { MIN_PASSWORD, setPassword } from "./users.js";

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

const username = process.argv[2];
const user = db.prepare("SELECT id, password_hash FROM user WHERE username = ?").get(username ?? "") as
  | { id: number; password_hash: string | null }
  | undefined;
if (!user) {
  console.error(`Usage: npm run reset-password -- <username>${username ? ` (no user "${username}")` : ""}`);
  process.exit(1);
}
if (!user.password_hash) {
  console.error(`"${username}" signs in through Home Assistant and has no password here.`);
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.error("Run this in a terminal (with docker: docker compose exec -it …), the password is read without echo.");
  process.exit(1);
}

const pw = await ask("New password: ");
if (pw.length < MIN_PASSWORD) {
  console.error(`The password must be at least ${MIN_PASSWORD} characters.`);
  process.exit(1);
}
if ((await ask("Repeat it: ")) !== pw) {
  console.error("The passwords do not match.");
  process.exit(1);
}
await setPassword(user.id, pw);
console.log(`Password of "${username}" changed; all its sessions are signed out.`);
