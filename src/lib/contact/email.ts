/**
 * The email the owner receives for a submission: plain text and a simple HTML version with the
 * same content (intent, the details, name, email, message, time). Every value the visitor typed is
 * escaped in the HTML. Labels come from ui.ts (`transmissionEmail`).
 */
import type { Ui } from "@/content/data/ui";
import type { Submission } from "./submission";
import { fill } from "./template";

export type OutgoingMail = {
  subject: string;
  text: string;
  html: string;
  /** The visitor's address: replying to the email answers them. */
  replyTo: string;
};

type EmailCopy = Ui["transmissionEmail"];

const SUBJECT_NAME_MAX = 60;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function formatSentAt(date: Date, timeZone: string): string {
  const local = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
  return `${local} (${date.toISOString()})`;
}

export function buildEmail(submission: Submission, copy: EmailCopy, sentAt: Date, timeZone: string): OutgoingMail {
  const { intent, details, name, email, message } = submission;
  const shortName = name.length > SUBJECT_NAME_MAX ? `${name.slice(0, SUBJECT_NAME_MAX - 1)}…` : name;
  const subject = fill(copy.subject, { intent: intent.label, name: shortName });
  const when = formatSentAt(sentAt, timeZone);

  const rows: [string, string][] = [
    [copy.intentLabel, intent.label],
    ...details.map((d): [string, string] => [d.question.label, d.answer ?? copy.notAnswered]),
    [copy.nameLabel, name],
    [copy.emailLabel, email],
    [copy.timeLabel, when],
  ];
  const body = message || copy.noMessage;
  const footer = fill(copy.footer, { name });

  const text = [
    copy.heading,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `${copy.messageLabel}:`,
    body,
    "",
    "--",
    footer,
  ].join("\n");

  const cell = "padding:4px 16px 4px 0;vertical-align:top;text-align:left";
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    `<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(copy.heading)}</h1>`,
    '<table role="presentation" style="border-collapse:collapse;margin:0 0 16px">',
    ...rows.map(
      ([label, value]) =>
        `<tr><th style="${cell};color:#555;font-weight:600">${escapeHtml(label)}</th><td style="${cell}">${escapeHtml(value)}</td></tr>`,
    ),
    "</table>",
    `<h2 style="font-size:15px;margin:0 0 4px;color:#555">${escapeHtml(copy.messageLabel)}</h2>`,
    `<p style="white-space:pre-wrap;margin:0 0 24px">${escapeHtml(body)}</p>`,
    `<p style="font-size:13px;color:#555;margin:0">${escapeHtml(footer)}</p>`,
    "</div>",
  ].join("\n");

  return { subject, text, html, replyTo: email };
}
