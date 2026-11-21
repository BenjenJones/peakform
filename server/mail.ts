import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";

let transport: Transporter | null = null;

function mailer() {
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    // Without implicit TLS, insist on STARTTLS instead of silently sending in plain text.
    requireTLS: !config.smtp.secure && config.smtp.requireTls,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
}

const TEXT = {
  en: {
    subject: "PeakForm: reset your password",
    body: (user: string, link: string, min: number) =>
      `Hello ${user},\n\nsomeone asked to reset the password of your PeakForm account. To choose a new one, open this link within ${min} minutes:\n\n${link}\n\nIt works once. If this wasn't you, ignore this mail: your password stays as it is.\n`,
  },
  de: {
    subject: "PeakForm: Passwort zurücksetzen",
    body: (user: string, link: string, min: number) =>
      `Hallo ${user},\n\nfür dein PeakForm-Konto wurde ein neues Passwort angefordert. Öffne innerhalb von ${min} Minuten diesen Link, um eins zu wählen:\n\n${link}\n\nEr funktioniert nur einmal. Warst du das nicht, ignoriere diese Mail: dein Passwort bleibt, wie es ist.\n`,
  },
};

export async function sendResetMail(to: string, username: string, token: string, lang: string, minutes: number) {
  const tx = TEXT[lang === "de" ? "de" : "en"];
  // The token sits in the fragment: browsers never send it to a server or in a Referer.
  const link = `${config.publicUrl}/#/reset/${token}`;
  await mailer().sendMail({ from: config.smtp.from, to, subject: tx.subject, text: tx.body(username, link, minutes) });
}
