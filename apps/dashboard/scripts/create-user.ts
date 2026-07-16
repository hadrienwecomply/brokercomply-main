/**
 * Create (or update the password of) a dashboard user account.
 *
 * The password is prompted interactively (hidden input) — never passed as an
 * argv so it doesn't land in shell history. Re-running with an existing email
 * offers to reset that user's password instead of failing.
 *
 * Run: pnpm -F @brokercomply/dashboard exec tsx scripts/create-user.ts <email> <display name…>
 * e.g. pnpm -F @brokercomply/dashboard exec tsx scripts/create-user.ts sdv@we-comply.be Sacha
 *
 * Targets the DB of DATABASE_URL (local by default; set it to the Railway URL
 * to create the production accounts).
 */
import { createInterface, type Interface } from "node:readline";
import {
  createDb,
  createUser,
  getUserByEmail,
  normalizeEmail,
  setUserPassword,
} from "@brokercomply/shared";

/*
 * Two input modes:
 *  - TTY: ONE shared readline interface (a second createInterface would find
 *    stdin already drained and hang), with echo suppressed for passwords.
 *  - piped stdin (heredoc/CI): readline closes on EOF before we can ask, so
 *    read everything up-front and answer prompts line by line.
 */
const isTTY = Boolean(process.stdin.isTTY);
const rl: Interface | null = isTTY
  ? createInterface({ input: process.stdin, output: process.stdout })
  : null;

let pipedLines: string[] | null = null;
async function nextPipedLine(): Promise<string> {
  if (!pipedLines) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    pipedLines = Buffer.concat(chunks).toString("utf8").split("\n");
  }
  return pipedLines.shift() ?? "";
}

function prompt(question: string): Promise<string> {
  if (!rl) return nextPipedLine();
  return new Promise((resolve) => rl.question(question, resolve));
}

/** Prompt without echoing the typed characters (password input). */
function promptHidden(question: string): Promise<string> {
  if (!rl) return nextPipedLine();
  const mutable = rl as Interface & { _writeToOutput?: (s: string) => void };
  process.stdout.write(question);
  const original = mutable._writeToOutput;
  mutable._writeToOutput = () => {}; // swallow the echo
  return new Promise((resolve) =>
    rl.question("", (answer) => {
      mutable._writeToOutput = original;
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const displayName = nameParts.join(" ").trim();
  if (!emailArg || !emailArg.includes("@")) {
    console.error(
      "Usage: tsx scripts/create-user.ts <email> <display name…>\n" +
        "  e.g. tsx scripts/create-user.ts sdv@we-comply.be Sacha",
    );
    process.exit(1);
  }
  const email = normalizeEmail(emailArg);

  const { db, client } = createDb();
  try {
    const existing = await getUserByEmail({ db }, email);
    if (existing) {
      const answer = await prompt(
        `${email} already exists (${existing.displayName}). Reset password? [y/N] `,
      );
      if (answer.trim().toLowerCase() !== "y") {
        console.log("Aborted — nothing changed.");
        return;
      }
    } else if (!displayName) {
      console.error("A display name is required to create a new user.");
      process.exit(1);
    }

    const password = await promptHidden("Password: ");
    if (password.length < 10) {
      console.error("Password must be at least 10 characters.");
      process.exit(1);
    }
    const confirm = await promptHidden("Confirm password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      process.exit(1);
    }

    if (existing) {
      await setUserPassword({ db }, existing.id, password);
      console.log(`Password updated for ${email}. Their open sessions are now stale.`);
    } else {
      const user = await createUser({ db }, { email, displayName, password });
      console.log(`Created ${user.email} (${user.displayName}).`);
    }
  } finally {
    rl?.close();
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
