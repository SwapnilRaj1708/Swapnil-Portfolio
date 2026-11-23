"use client";

import { clsx } from "clsx";
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Link } from "@/components/ui/link";
import type { Ui } from "@/content/data/ui";
import type { ContactFlow, ContactIntent, DetailQuestion } from "@/content/schema";
import {
  clearFlow,
  createFlowReducer,
  currentStep,
  initialState,
  loadFlow,
  pickedLabel,
  progressOf,
  saveFlow,
  type Stage,
  type Step,
  stepProblems,
} from "@/lib/contact/flow";
import { CONTACT_ENDPOINT, CURRENCIES, detailField, FIELD, LIMITS, SENT_EVENT, type SendErrorCode } from "@/lib/contact/fields";
import { optionsOf } from "@/lib/contact/checks";
import { fill } from "@/lib/contact/template";

/** Pause before a single choice moves on by itself; "Stay here" or Escape cancels it. */
const AUTO_ADVANCE_MS = 1200;

type Copy = Ui["transmission"];

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "error"; error: SendErrorCode };

export type TransmissionProps = {
  flow: ContactFlow;
  copy: Copy;
  /** The owner's public address: the fallback link when sending fails. */
  ownerEmail: string;
  /** Pause before a single choice moves on (default AUTO_ADVANCE_MS; tests shorten it). */
  autoAdvanceMs?: number;
};

const headingId = (key: string) => `tx-q-${key}`;
const errorId = (field: string) => `tx-err-${field}`;

const fieldClasses =
  "min-h-tap w-full rounded-xs border border-text-muted bg-background px-3 py-2 text-base text-text " +
  "transition-colors duration-fast ease-signal hover:border-text aria-invalid:border-accent-trace";

function StepHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h4 id={id} tabIndex={-1} className="font-heading text-2xl font-medium text-text">
      {children}
    </h4>
  );
}

function FieldError({ field, message }: { field: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={errorId(field)} className="text-sm text-accent-trace">
      {message}
    </p>
  );
}

/** The question a step asks (its heading), for the announcement after each step change. */
function questionOf(flow: ContactFlow, copy: Copy, s: Step): string {
  switch (s.kind) {
    case "intent":
      return flow.intentQuestion;
    case "detail":
      return s.question.label;
    case "contact":
      return copy.contactQuestion;
    case "message":
      return copy.messageQuestion;
    case "review":
      return copy.reviewQuestion;
  }
}

const subscribeNothing = () => () => {};
/**
 * The contact flow "Transmission" (BRIEF.md §6, PF-019): one question at a time, mostly picked
 * from options, then name and email, the pre-drafted message, review and Transmit.
 *
 * It is one real form. With JavaScript only the current step is shown (the others are
 * `display: none`); without it (`noscript:`) every question is on the page and the form posts to
 * /api/contact like any form, which answers with a result page. Step logic is pure and tested:
 * src/lib/contact/flow.ts. Here: rendering, keyboard, timers, focus, the live region, sending.
 */
export function Transmission({ flow, copy, ownerEmail, autoAdvanceMs = AUTO_ADVANCE_MS }: TransmissionProps) {
  const [reducer] = useState(() => createFlowReducer(flow));
  const [state, dispatch] = useReducer(reducer, flow, initialState);
  const [send, setSend] = useState<SendState>({ status: "idle" });
  // False on the server and during hydration, true once the script runs.
  const enhanced = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const formRef = useRef<HTMLFormElement>(null);
  const mountedAt = useRef(0);
  const arrowKey = useRef(false);

  const step = currentStep(flow, state);
  const progress = progressOf(flow, state);
  const { answers } = state;

  // Mount: restore saved answers (sessionStorage), start the clock for the minimum-time check.
  useEffect(() => {
    mountedAt.current = performance.now();
    const saved = loadFlow(flow);
    if (saved) dispatch({ type: "restore", ...saved });
  }, [flow]);

  // Answers survive Back and a refresh.
  useEffect(() => {
    if (enhanced && send.status !== "sent") saveFlow({ answers: state.answers, index: state.index });
  }, [enhanced, send.status, state.answers, state.index]);

  // Auto-advance after a single choice; a new pick restarts the pause, Undo cancels it.
  useEffect(() => {
    if (!state.pending) return;
    const pending = state.pending;
    const timer = window.setTimeout(() => dispatch({ type: "advance", pending }), autoAdvanceMs);
    return () => window.clearTimeout(timer);
  }, [state.pending, autoAdvanceMs]);

  // After a navigation: focus the new question's heading (the live region announces the step).
  useEffect(() => {
    if (state.nav === 0) return;
    document.getElementById(headingId(step.key))?.focus();
    // Only on navigation (nav changes); the step is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nav]);

  // After a refused "Next": focus the first field with an error.
  useEffect(() => {
    if (state.errorNav === 0) return;
    const field = Object.keys(state.errors)[0];
    if (field) formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.errorNav]);

  const stageLabel: Record<Stage, string> = {
    intent: copy.stepIntent,
    details: copy.stepDetails,
    contact: copy.stepContact,
    message: copy.stepMessage,
    review: copy.stepReview,
  };

  function optionStepOptions(s: Step): { id: string }[] {
    if (s.kind === "intent") return flow.intents;
    if (s.kind === "detail") return optionsOf(s.question, answers.currency);
    return [];
  }

  async function transmit() {
    const problems = stepProblems(flow, { kind: "review", key: "review", stage: "review" }, answers);
    if (Object.keys(problems).length) {
      dispatch({ type: "next" }); // moves to the first step that needs attention
      return;
    }
    const form = formRef.current;
    if (!form || send.status === "sending") return;
    const data = new FormData(form);
    data.set(FIELD.elapsed, String(Math.round(performance.now() - mountedAt.current)));
    setSend({ status: "sending" });
    let error: SendErrorCode = "failed";
    try {
      const res = await fetch(CONTACT_ENDPOINT, { method: "POST", body: data, headers: { Accept: "application/json" } });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok && body && typeof body === "object" && (body as { ok?: unknown }).ok === true) {
        clearFlow();
        setSend({ status: "sent", email: answers.email.trim() });
        // One success event per send – PF-018 turns it into the spire's send pulse.
        window.dispatchEvent(new CustomEvent(SENT_EVENT, { detail: { intent: answers.intent } }));
        return;
      }
      const code = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
      if (code === "invalid" || code === "too-fast" || code === "rate-limited" || code === "forbidden") error = code;
    } catch {
      // Network failure: shown as "failed" with retry and the direct email link.
    }
    setSend({ status: "error", error });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // With JavaScript the flow handles every submit; without it the form posts normally.
    event.preventDefault();
    if (step.kind === "review") void transmit();
    else dispatch({ type: "next" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const target = event.target as HTMLElement;
    const typing = target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== "radio");
    if (event.key.startsWith("Arrow")) {
      // Moving through a radio group with the arrow keys is not a pick: no auto-advance.
      arrowKey.current = target instanceof HTMLInputElement && target.type === "radio";
      return;
    }
    if (event.key === "Escape" && state.pending) {
      event.preventDefault();
      dispatch({ type: "undo" });
      return;
    }
    if (event.key === "Enter" && !event.altKey && !event.shiftKey) {
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
      if (target instanceof HTMLTextAreaElement && !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      formRef.current?.requestSubmit();
      return;
    }
    if (!typing && /^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const option = optionStepOptions(step)[Number(event.key) - 1];
      if (!option) return;
      event.preventDefault();
      dispatch({ type: "pick", field: step.kind === "detail" ? step.key : FIELD.intent, value: option.id, auto: true });
    }
  }

  function pick(field: string, value: string) {
    const auto = !arrowKey.current;
    arrowKey.current = false;
    dispatch({ type: "pick", field, value, auto });
  }

  // -------------------------------------------------------------------------------------------
  // Sent: the confirmation replaces the form.

  if (send.status === "sent") {
    return (
      <SentPanel
        copy={copy}
        email={send.email}
        onAgain={() => {
          setSend({ status: "idle" });
          dispatch({ type: "reset" });
        }}
      />
    );
  }

  const animate = state.nav > 0;
  const frame = (s: Step, children: ReactNode) => {
    const current = s.key === step.key;
    return (
      <div
        key={s.key}
        data-step={s.key}
        className={clsx(
          "flex-col gap-5",
          current ? "flex" : "hidden noscript:flex",
          current && animate && (state.direction === "back" ? "animate-step-back" : "animate-step-in"),
        )}
      >
        {children}
      </div>
    );
  };

  const optionGroup = (s: Step, field: string, question: string, options: { id: string; label: ReactNode }[], value: string | null | undefined, extra?: ReactNode) => {
    const error = state.errors[field];
    return (
      <fieldset aria-describedby={error ? errorId(field) : undefined} className="flex flex-col gap-4">
        <legend className="mb-4">
          <StepHeading id={headingId(s.key)}>{question}</StepHeading>
        </legend>
        {extra}
        <div className={clsx("grid gap-2", s.kind === "intent" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
          {options.map((option, i) => (
            <Chip
              key={option.id}
              name={field}
              value={option.id}
              checked={value === option.id}
              required={s.kind === "intent"}
              onChange={() => pick(field, option.id)}
              className={clsx("min-h-14 text-base", s.kind === "intent" && "sm:min-h-16")}
            >
              <span aria-hidden="true" className="label-mono text-text-muted noscript:hidden">
                {i + 1}
              </span>
              {option.label}
            </Chip>
          ))}
        </div>
        <div className="noscript:hidden">
          <p className="hidden text-sm text-text-muted pointer-fine:block">{copy.numberHint}</p>
        </div>
        <FieldError field={field} message={error ? copy[error] : undefined} />
      </fieldset>
    );
  };

  const detailFrame = (intent: ContactIntent, question: DetailQuestion, i: number) => {
    const key = detailField(intent.id, question.id);
    const s: Step = { kind: "detail", key, stage: "details", intent, question, number: i + 1, count: intent.details.length };
    const value = answers.details[key];
    let options: { id: string; label: ReactNode }[];
    let currencyToggle: ReactNode = null;
    if (question.currencies) {
      // Budget: each option carries its label in both currencies; CSS shows the one that matches
      // the checked currency (globals.css), so the toggle also works without JavaScript.
      const base = question.currencies[0].options;
      options = base.map((o) => ({
        id: o.id,
        label: (
          <span>
            {question.currencies!.map((c) => (
              <span key={c.id} data-currency={c.id}>
                {c.options.find((x) => x.id === o.id)?.label ?? o.label}
              </span>
            ))}
          </span>
        ),
      }));
      currencyToggle = (
        <ChipGroup legend={copy.currencyLegend} className="mb-2">
          {CURRENCIES.map((id) => {
            const c = question.currencies!.find((x) => x.id === id);
            if (!c) return null;
            return (
              <Chip key={id} name={FIELD.currency} value={id} checked={answers.currency === id} onChange={() => {
                  arrowKey.current = false;
                  dispatch({ type: "currency", value: id });
                }}>
                {c.symbol} {id.toUpperCase()}
              </Chip>
            );
          })}
        </ChipGroup>
      );
    } else {
      options = optionsOf(question, answers.currency);
    }
    return frame(
      s,
      <>
        {i === 0 ? <p className="label-mono hidden text-accent-trace noscript:block">{fill(copy.noScriptDetailsFor, { intent: intent.label })}</p> : null}
        {optionGroup(s, key, question.label, options, value, currencyToggle)}
      </>,
    );
  };

  const nameError = state.errors[FIELD.name];
  const emailError = state.errors[FIELD.email];
  const messageError = state.errors[FIELD.message];
  const intent = flow.intents.find((x) => x.id === answers.intent);
  const sending = send.status === "sending";
  const failed = send.status === "error" ? send.error : null;
  // Polite live region: the step after each change, the auto-advance pause, sending.
  const announcement = sending
    ? copy.sending
    : state.pending
      ? copy.autoAdvance
      : state.nav > 0
        ? fill(copy.announceStep, { current: progress.current, total: progress.total, question: questionOf(flow, copy, step) })
        : "";

  return (
    <div className="flex flex-col gap-6">
      {/* Progress: always shown while the flow runs (not in the plain form). */}
      <div className="flex flex-col gap-3 noscript:hidden">
        <p className="label-mono text-text-muted">
          {fill(copy.progress, { current: progress.current, total: progress.total })}
          {progress.question ? ` · ${fill(copy.questionProgress, progress.question)}` : null}
        </p>
        <ol aria-hidden="true" className="flex gap-1">
          {progress.stages.map((stage, i) => (
            <li key={stage} className="flex flex-1 flex-col gap-2">
              <span className={clsx("h-0.5 transition-colors duration-moderate ease-signal", i < progress.current ? "bg-accent-signal" : "bg-line-strong")} />
              <span className={clsx("label-mono hidden sm:block", i === progress.current - 1 ? "text-text" : "text-text-muted")}>{stageLabel[stage]}</span>
            </li>
          ))}
        </ol>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <form
        ref={formRef}
        onPointerDown={() => (arrowKey.current = false)}
        action={CONTACT_ENDPOINT}
        method="post"
        aria-label={copy.label}
        noValidate={enhanced}
        onSubmit={onSubmit}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-10 noscript:gap-12"
      >
        {/* Trap: hidden from people and assistive technology; bots that fill it are refused. */}
        <div aria-hidden="true" className="sr-only">
          <label>
            {copy.trapLabel}
            <input type="text" name={FIELD.trap} tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        {frame(
          { kind: "intent", key: "intent", stage: "intent" },
          optionGroup({ kind: "intent", key: "intent", stage: "intent" }, FIELD.intent, flow.intentQuestion, flow.intents, answers.intent),
        )}

        {flow.intents.flatMap((i) => i.details.map((q, n) => detailFrame(i, q, n)))}

        {frame(
          { kind: "contact", key: "contact", stage: "contact" },
          <>
            <StepHeading id={headingId("contact")}>{copy.contactQuestion}</StepHeading>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="tx-name" className="label-mono text-text-muted">
                  {copy.nameLabel}
                </label>
                <input
                  id="tx-name"
                  name={FIELD.name}
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={LIMITS.name}
                  value={answers.name}
                  onChange={(e) => dispatch({ type: "text", field: "name", value: e.target.value })}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? errorId(FIELD.name) : undefined}
                  className={fieldClasses}
                />
                <FieldError field={FIELD.name} message={nameError ? copy[nameError] : undefined} />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="tx-email" className="label-mono text-text-muted">
                  {copy.emailLabel}
                </label>
                <input
                  id="tx-email"
                  name={FIELD.email}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  maxLength={LIMITS.email}
                  value={answers.email}
                  onChange={(e) => dispatch({ type: "text", field: "email", value: e.target.value })}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? errorId(FIELD.email) : undefined}
                  className={fieldClasses}
                />
                <FieldError field={FIELD.email} message={emailError ? copy[emailError] : undefined} />
              </div>
            </div>
          </>,
        )}

        {frame(
          { kind: "message", key: "message", stage: "message" },
          <>
            <StepHeading id={headingId("message")}>{copy.messageQuestion}</StepHeading>
            <div className="flex flex-col gap-2">
              <label htmlFor="tx-message" className="label-mono text-text-muted">
                {copy.messageLabel}
              </label>
              <p id="tx-message-hint" className="text-sm text-text-muted noscript:hidden">
                {copy.messageHint}
              </p>
              <textarea
                id="tx-message"
                name={FIELD.message}
                rows={5}
                maxLength={LIMITS.message}
                value={answers.message}
                onChange={(e) => dispatch({ type: "text", field: "message", value: e.target.value })}
                aria-invalid={messageError ? true : undefined}
                aria-describedby={clsx("tx-message-hint", messageError && errorId(FIELD.message))}
                className={clsx(fieldClasses, "resize-y")}
              />
              <FieldError field={FIELD.message} message={messageError ? copy[messageError] : undefined} />
            </div>
          </>,
        )}

        {frame(
          { kind: "review", key: "review", stage: "review" },
          <>
            <StepHeading id={headingId("review")}>{copy.reviewQuestion}</StepHeading>
            <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-5 sm:grid-cols-4 noscript:hidden">
              <dt className="label-mono text-text-muted sm:pt-1">{copy.reviewIntent}</dt>
              <dd className="text-text sm:col-span-3">{intent?.label}</dd>
              {intent?.details.map((q) => (
                <ReviewRow key={q.id} label={q.label}>
                  {pickedLabel(q, answers.details[detailField(intent.id, q.id)], answers.currency)}
                </ReviewRow>
              ))}
              <ReviewRow label={copy.reviewName}>{answers.name.trim()}</ReviewRow>
              <ReviewRow label={copy.reviewEmail}>{answers.email.trim()}</ReviewRow>
              <ReviewRow label={copy.reviewMessage}>
                <span className="whitespace-pre-wrap">{answers.message.trim() || copy.noMessage}</span>
              </ReviewRow>
            </dl>
            <p className="text-sm text-text-muted">{copy.privacy}</p>
            {failed ? (
              <div role="alert" className="flex flex-col gap-2 border-l-2 border-accent-trace pl-4">
                <p className="font-heading text-lg text-text">{copy.failedHeading}</p>
                <p className="text-text-muted">{errorMessage(copy, failed)}</p>
                <p className="text-text">
                  {copy.emailInstead}:{" "}
                  <Link href={`mailto:${ownerEmail}?body=${encodeURIComponent(answers.message)}`} className="break-all">
                    {ownerEmail}
                  </Link>
                </p>
              </div>
            ) : null}
          </>,
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5 noscript:border-0 noscript:pt-0">
          {/* Not on the first question (nothing to go back to); focus never rests on it when it
              goes, since every step change moves focus to the new question's heading. */}
          {state.index > 0 ? (
            <Button variant="secondary" size="lg" onClick={() => dispatch({ type: "back" })} disabled={!enhanced || sending} className="noscript:hidden">
              ← {copy.back}
            </Button>
          ) : null}
          {state.pending ? (
            <p className="flex items-center gap-3 text-sm text-text-muted">
              <span>{copy.autoAdvance}</span>
              <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "undo" })}>
                {copy.autoAdvanceUndo}
              </Button>
            </p>
          ) : null}
          <span className="flex-1" />
          {step.kind === "review" ? null : (
            <Button type="submit" size="lg" disabled={!enhanced} className="noscript:hidden">
              {copy.next} →
            </Button>
          )}
          {/* Shown on the review step, and always in the plain form (the wrapper carries the
              display rule, so the button's own inline-flex cannot override it). */}
          <span className={step.kind === "review" ? "contents" : "hidden noscript:contents"}>
            <Button type="submit" size="lg" disabled={sending}>
              {sending ? copy.sending : failed ? copy.retry : copy.transmit}
            </Button>
          </span>
        </div>
      </form>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="label-mono text-text-muted sm:pt-1">{label}</dt>
      <dd className="wrap-break-word text-text sm:col-span-3">{children}</dd>
    </>
  );
}

function errorMessage(copy: Copy, error: SendErrorCode): string {
  switch (error) {
    case "too-fast":
      return copy.tooFastBody;
    case "rate-limited":
      return copy.rateLimitedBody;
    case "invalid":
    case "forbidden":
      return copy.invalidBody;
    case "failed":
      return copy.failedBody;
  }
}

function SentPanel({ copy, email, onAgain }: { copy: Copy; email: string; onAgain: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex flex-col items-start gap-4" data-transmission="sent">
      <h4 ref={heading} tabIndex={-1} className="font-heading text-2xl font-medium text-text">
        {copy.sentHeading}
      </h4>
      <p className="max-w-prose text-text">{fill(copy.sentBody, { email })}</p>
      <Button variant="secondary" size="lg" onClick={onAgain}>
        {copy.sendAnother}
      </Button>
    </div>
  );
}

