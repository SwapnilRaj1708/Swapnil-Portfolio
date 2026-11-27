"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { publishChapterSection } from "@/lib/journey/chapter-bridge";
import { CHAPTERS, chapterIndexOfSection } from "@/lib/journey/chapters";
import { countRender, journeyDebug, type JumpDebug } from "@/lib/journey/debug";
import { createJumpWatch, jumpTuning, watchJump, type JumpWatch } from "@/lib/journey/jump-watch";
import { chapterBoundaries, locateChapter, maxScrollOf, scrollToProgress, type ChapterLocation } from "@/lib/journey/scroll-math";
import { journeyOverrides } from "@/lib/journey/overrides";
import { cameraDamped, chooseScrollMode, type ScrollMode } from "@/lib/journey/scroll-mode";
import { activateScroll, deactivateScroll, scrollStore, setScrollPosition } from "@/lib/journey/scroll-store";
import { REDUCED_MOTION_QUERY } from "@/lib/journey/signals";
import { scrollTuning } from "./scroll.tuning";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * The scroll spine (STANDARDS.md §1, PF-008). Part of the lazy 3D chunk: it runs only in the
 * non-static tiers, only while the canvas is mounted, and only on a page with every chapter's
 * section (the home page). Elsewhere – other routes, the static tier, the production deployment –
 * scrolling is the browser's own and nothing here exists.
 *
 * On the home page:
 *   - ScrollTrigger drives the updates: one trigger over the whole page (start 0 → end "max").
 *     Its onUpdate turns every scroll tick into `progress`, `chapter` and `chapterProgress` in the
 *     scroll store (exact maths in scroll-math.ts); its onRefresh re-measures the sections after
 *     any layout change (a ResizeObserver on the body asks for a refresh; fonts, images, rotation).
 *   - Lenis smooths wheel input on fine-pointer devices (scroll-mode.ts); keyboard, scrollbar,
 *     find-in-page and touch stay native. `?smooth=off` (never on production) turns it off.
 *   - Chapter boundaries are the measured sections; each chapter's extra scroll length (registry)
 *     is added as extra height at the end of its section.
 *   - Same-page links to a chapter section (the navigation's `/#about` …) scroll there smoothly
 *     (Lenis, or the browser's smooth scroll without it), land at the section's start below the
 *     header, update the URL and move focus to the section – only once the page is there, even if
 *     the layout changes or a refresh comes while it travels. Instant under reduced motion.
 *   - The current chapter's section is mirrored to the document for the navigation
 *     (chapter-bridge.ts).
 * It re-runs on every client navigation (the pathname), so leaving the home page tears it all down
 * and returning sets it up again at the restored scroll position.
 */
export function ScrollSpine() {
  countRender("ScrollSpine");
  const pathname = usePathname();
  useGSAP(() => startSpine(), { dependencies: [pathname], revertOnUpdate: true });
  return null;
}

/** The dev panel asks the running spine to re-apply extra scroll lengths and re-measure. */
let relayout: (() => void) | null = null;
export function requestSpineLayout(): void {
  relayout?.();
}

function matches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** A nav jump in flight (see "Jumps to a chapter" in runSpine). */
type Jump = {
  index: number;
  /** The chapter start it is heading for (scroll px), as measured when it was last driven. */
  target: number;
  retargets: number;
  /** Drives so far: a Lenis `onComplete` from a replaced animation is ignored. */
  drives: number;
  instant: boolean;
  watch: JumpWatch;
  frame: number;
  timer: number;
  /** What the debug hooks report. */
  record: JumpDebug;
};

/** The visitor's own scrolling during a jump ends it (passive listeners; nothing is cancelled). */
const TAKEOVER_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"]);

/** How many frames the spine waits for a page's chapter sections to be shown (see below). */
const SHOW_WAIT_FRAMES = 60;

/**
 * Starts the spine on this page if it is the home page: every chapter's section is there and
 * rendered. With Cache Components, Next.js keeps the previous route's DOM mounted but hidden
 * (React `<Activity>`, display: none) for an instant Back, so on a case study the home sections
 * still exist – hidden. They must be shown, not merely present. On a client navigation back, they
 * are shown in the same commit or a frame later: present-but-hidden sections are polled for a few
 * frames. Returns the teardown.
 */
function startSpine(): () => void {
  deactivateScroll();
  publishChapterSection(null);
  let stop: (() => void) | null = null;
  let frame = 0;
  let tries = 0;
  const attempt = () => {
    frame = 0;
    const sections = CHAPTERS.map((c) => document.getElementById(c.sectionId));
    if (sections.some((s) => !s || !s.hasAttribute("data-chapter"))) return;
    const els = sections as HTMLElement[];
    if (els.every((s) => s.getClientRects().length > 0)) {
      stop = runSpine(els);
      return;
    }
    if (tries++ < SHOW_WAIT_FRAMES) frame = window.requestAnimationFrame(attempt);
  };
  attempt();
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    stop?.();
  };
}

/** Sets everything up on the home page; returns the teardown. */
function runSpine(els: HTMLElement[]): () => void {
  const root = document.documentElement;
  const mode: ScrollMode = chooseScrollMode({
    // `?smooth=off` as this visit was loaded with (overrides.ts), not the current address.
    smoothOverride: journeyOverrides().smooth,
    finePointer: matches("(pointer: fine)"),
  });

  // --- Measuring -------------------------------------------------------------------------------
  const boundaries: number[] = [];
  const tops: number[] = [];
  const location: ChapterLocation = { index: 0, progress: 0 };
  let max = 0;
  let headerOffset = 0;

  const applyExtraScroll = () => {
    CHAPTERS.forEach((c, i) => {
      const extra = c.extraScroll > 0 ? c.extraScroll : 0;
      els[i].style.paddingBottom = extra ? `calc(${extra} * 100svh)` : "";
    });
  };

  const measure = () => {
    const scroller = document.scrollingElement ?? root;
    max = maxScrollOf(scroller.scrollHeight, scroller.clientHeight);
    // The sticky header's offset as the browser applies it when it lands an anchor on a section:
    // the sections' `scroll-margin-top` (globals.css, PF-030; one rule for every section).
    headerOffset = Number.parseFloat(getComputedStyle(els[0]).scrollMarginTop) || 0;
    const y = window.scrollY;
    tops.length = els.length;
    for (let i = 0; i < els.length; i++) tops[i] = els[i].getBoundingClientRect().top + y;
    chapterBoundaries(tops, headerOffset, max, boundaries);
  };

  const update = () => {
    const scroll = window.scrollY;
    locateChapter(scroll, boundaries, max, location);
    setScrollPosition(scrollToProgress(scroll, max), location.index, location.progress);
  };

  applyExtraScroll();
  measure();

  // A deep link to a chapter lands where the browser put it; with extra scroll lengths applied the
  // sections moved after that, so land again on the section's start.
  const hashIndex = chapterIndexOfSection(decodeURIComponent(window.location.hash.slice(1)));
  if (hashIndex > 0 && CHAPTERS.some((c) => c.extraScroll > 0)) window.scrollTo({ top: boundaries[hashIndex], behavior: "instant" });

  activateScroll(mode);
  update();

  // --- The current chapter, for the navigation ---------------------------------------------------
  const publish = () => {
    const { chapterIndex } = scrollStore.getState();
    publishChapterSection(chapterIndex >= 0 ? CHAPTERS[chapterIndex].sectionId : null);
  };
  publish();
  const unsubscribe = scrollStore.subscribe((now, before) => {
    if (now.chapterIndex !== before.chapterIndex) publish();
  });

  // --- Jumps to a chapter: state (the controller is further down) -------------------------------
  // Declared before the trigger: its onRefresh sends a jump in flight on again.
  let jump: Jump | null = null;
  let lastJump: JumpDebug | null = null;
  /** A refresh the spine held back while a jump ran (it sets the scroll position): run on landing. */
  let refreshDeferred = false;

  // --- ScrollTrigger: updates and refreshes -----------------------------------------------------
  // Killed in the teardown below (it may be created a frame after useGSAP's context recorded).
  const trigger = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: update,
    onRefresh: () => {
      measure();
      update();
      // A refresh measures by scrolling to 0 and back to the recorded position (ScrollTrigger's own
      // way), which cancels a browser smooth scroll wherever it was. The spine holds its own
      // refreshes back while a jump runs (below), so this is one from elsewhere – or the held one,
      // run as the jump lands: either way a jump not at its target is sent on toward it.
      if (jump && Math.abs(window.scrollY - boundaries[jump.index]) > jumpTuning.tolerance) retargetJump(jump);
    },
  });
  /**
   * The spine's own refreshes (layout changes, fonts, extra scroll lengths). While a jump runs,
   * ScrollTrigger's refresh waits until it has landed – it would set the scroll position mid-flight
   * – and the sections are re-measured at once instead (measuring never scrolls): if the jump's
   * target moved, the jump follows it.
   */
  const refresh = () => {
    if (jump) {
      refreshDeferred = true;
      jump.record.refreshDeferred = true;
      measure();
      update();
      followJumpTarget(jump);
      return;
    }
    ScrollTrigger.refresh();
  };
  let refreshQueued = 0;
  const queueRefresh = () => {
    if (refreshQueued) return;
    refreshQueued = window.requestAnimationFrame(() => {
      refreshQueued = 0;
      refresh();
    });
  };
  const bodyObserver = new ResizeObserver(queueRefresh);
  bodyObserver.observe(document.body);
  // The viewport height alone (a phone's address bar, a rotation) changes the maximum: re-measure
  // at once (ScrollTrigger itself ignores address-bar resizes on touch devices).
  const onResize = () => {
    measure();
    update();
    if (jump) followJumpTarget(jump);
  };
  window.addEventListener("resize", onResize, { passive: true });
  void document.fonts?.ready.then(queueRefresh);

  // --- Lenis (wheel smoothing) ------------------------------------------------------------------
  let lenis: Lenis | null = null;
  let tick: ((time: number) => void) | null = null;
  if (mode === "lenis") {
    const instance = new Lenis({
      lerp: scrollTuning.lenisLerp,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1,
      allowNestedScroll: true,
      anchors: false,
      autoRaf: false,
    });
    lenis = instance;
    instance.on("scroll", ScrollTrigger.update);
    tick = (time: number) => {
      instance.options.lerp = scrollTuning.lenisLerp;
      instance.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
  }

  // --- Jumps to a chapter -----------------------------------------------------------------------
  // A jump ends when the page is verifiably at the chapter's start (PF-009 follow-up 1), never on a
  // `scrollend` alone: that event may belong to another scroll (an instant scroll just before the
  // jump dispatches its `scrollend` a frame later – after the jump began, on a busy main thread).
  //   - Lenis: its `onComplete`, then the position is checked against the target as measured now.
  //   - Native smooth scroll: the position is watched once per frame (jump-watch.ts): landed = at
  //     the target and still; stalled = stopped short (cancelled by an instant scroll elsewhere,
  //     e.g. a refresh) → sent on again.
  //   - A layout change or a refresh while it runs: the spine's own refresh waits until it lands
  //     (`refresh` above); the target is re-measured and the jump follows it. A refresh from
  //     elsewhere sends it on (onRefresh above).
  //   - Sent on at most `jumpTuning.maxRetargets` times, and given `jumpTuning.timeoutMs`; then it
  //     lands instantly. The visitor's own scrolling (wheel, touch, pointer, a scrolling key) ends it
  //     where it is, without moving focus (Lenis does the same with its own animation).
  //   - Then a held-back refresh runs (it may move the target: the jump goes on) and focus moves to
  //     the section with `preventScroll`.
  const addedTabIndex = new Set<HTMLElement>();
  const focusSection = (index: number) => {
    const section = els[index];
    if (!section.hasAttribute("tabindex")) {
      section.setAttribute("tabindex", "-1");
      addedTabIndex.add(section);
    }
    section.focus({ preventScroll: true });
  };
  const atTarget = (j: Jump) => Math.abs(window.scrollY - boundaries[j.index]) <= jumpTuning.tolerance;

  /** The visitor scrolls during a jump: theirs wins. All listeners passive; nothing is cancelled. */
  const onTakeover = (event: Event) => {
    if (!jump) return;
    if (event.type === "keydown" && !SCROLL_KEYS.has((event as KeyboardEvent).key)) return;
    endJump(jump, "abandoned");
  };

  function endJump(j: Jump, outcome: "landed" | "forced" | "abandoned") {
    if (jump !== j) return;
    jump = null;
    window.cancelAnimationFrame(j.frame);
    window.clearTimeout(j.timer);
    for (const type of TAKEOVER_EVENTS) window.removeEventListener(type, onTakeover, { capture: true });
    j.record.outcome = outcome;
    lastJump = j.record;
    if (outcome !== "abandoned") {
      focusSection(j.index);
      j.record.focusedAt = window.scrollY;
    }
    if (refreshDeferred) {
      // Abandoned (or replaced) with a refresh held back: run it now that nothing is in flight.
      refreshDeferred = false;
      queueRefresh();
    }
  }

  /** At the target: a held-back refresh runs first (if it moves the target, the jump goes on). */
  function settleJump(j: Jump, outcome: "landed" | "forced") {
    if (jump !== j) return;
    if (refreshDeferred) {
      refreshDeferred = false;
      const drives = j.drives;
      ScrollTrigger.refresh(); // onRefresh re-measures; a jump no longer at its target is sent on
      if (jump !== j || j.drives !== drives) return;
    }
    endJump(j, outcome);
  }

  /** Scrolls toward the chapter's start as measured now. */
  function driveJump(j: Jump) {
    j.drives += 1;
    const drives = j.drives;
    j.target = boundaries[j.index];
    j.record.target = j.target;
    j.watch = createJumpWatch(window.scrollY, performance.now());
    if (lenis) {
      lenis.scrollTo(j.target, {
        immediate: j.instant,
        force: true,
        onComplete: () => {
          if (jump !== j || j.drives !== drives) return; // a later drive replaced this animation
          if (atTarget(j)) settleJump(j, "landed");
          else retargetJump(j);
        },
      });
      return;
    }
    window.scrollTo({ top: j.target, behavior: j.instant ? "instant" : "smooth" });
  }

  /** Sends the jump on (its target moved, or its scroll was cancelled); lands at once after too many. */
  function retargetJump(j: Jump) {
    if (jump !== j) return;
    j.retargets += 1;
    j.record.retargets = j.retargets;
    if (j.retargets > jumpTuning.maxRetargets) {
      landJump(j);
      return;
    }
    lenis?.resize(); // Lenis clamps to the page height it last measured
    driveJump(j);
  }

  function followJumpTarget(j: Jump) {
    if (Math.abs(boundaries[j.index] - j.target) > jumpTuning.tolerance) retargetJump(j);
  }

  /** Lands instantly (too many re-targets, or the time limit). */
  function landJump(j: Jump) {
    if (jump !== j) return;
    j.target = boundaries[j.index];
    j.record.target = j.target;
    if (lenis) {
      lenis.resize();
      lenis.scrollTo(j.target, { immediate: true, force: true });
    } else {
      window.scrollTo({ top: j.target, behavior: "instant" });
    }
    settleJump(j, "forced");
  }

  /** Native smooth scroll: one look per frame until the jump has landed. */
  function watchJumpFrames(j: Jump) {
    j.frame = window.requestAnimationFrame(() => {
      if (jump !== j) return;
      const state = watchJump(j.watch, window.scrollY, boundaries[j.index], performance.now());
      if (state === "landed") settleJump(j, "landed");
      else if (state === "stalled") retargetJump(j);
      if (jump === j) watchJumpFrames(j);
    });
  }

  const jumpTo = (index: number) => {
    if (jump) endJump(jump, "abandoned"); // a new jump replaces the one in flight
    const j: Jump = {
      index,
      target: boundaries[index],
      retargets: 0,
      drives: 0,
      instant: matches(REDUCED_MOTION_QUERY),
      watch: createJumpWatch(window.scrollY, performance.now()),
      frame: 0,
      timer: 0,
      record: { chapter: CHAPTERS[index].id, target: boundaries[index], retargets: 0, refreshDeferred: false, outcome: null, focusedAt: null },
    };
    jump = j;
    for (const type of TAKEOVER_EVENTS) window.addEventListener(type, onTakeover, { capture: true, passive: true });
    j.timer = window.setTimeout(() => landJump(j), jumpTuning.timeoutMs);
    driveJump(j);
    if (jump === j && !lenis) watchJumpFrames(j);
  };
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    // The same page: origin and path. A query on the current address (a campaign tag, a testing
    // override) is kept – the link would otherwise drop it and reload the page's data.
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
    const index = chapterIndexOfSection(decodeURIComponent(url.hash.slice(1)));
    if (index < 0) return;
    event.preventDefault(); // the click's own navigation, not a scroll input
    if (window.location.hash !== url.hash) window.history.pushState(null, "", url.hash);
    jumpTo(index);
  };
  document.addEventListener("click", onClick, { capture: true });

  relayout = () => {
    applyExtraScroll();
    refresh();
  };

  // --- Debug hooks ------------------------------------------------------------------------------
  const debug = journeyDebug();
  if (debug) {
    debug.scroll = () => {
      const s = scrollStore.getState();
      return {
        chapters: CHAPTERS.map((c) => c.id),
        active: s.active,
        mode: s.mode,
        damped: s.mode ? cameraDamped(s.mode) : false,
        progress: s.progress,
        chapter: s.chapter,
        chapterIndex: s.chapterIndex,
        chapterProgress: s.chapterProgress,
        epoch: s.epoch,
        boundaries: [...boundaries],
        max,
        scrollY: window.scrollY,
        sectionTops: [...tops],
        headerOffset,
        jump: jump ? { ...jump.record } : null,
        lastJump: lastJump ? { ...lastJump } : null,
      };
    };
    debug.refreshScroll = (how) => {
      if (how === "force") ScrollTrigger.refresh();
      else refresh();
    };
    debug.setExtraScroll = (chapter, viewportHeights) => {
      const entry = CHAPTERS.find((c) => c.id === chapter);
      if (!entry) return;
      entry.extraScroll = viewportHeights;
      relayout?.();
    };
  }

  return () => {
    relayout = null;
    if (jump) endJump(jump, "abandoned");
    trigger.kill();
    document.removeEventListener("click", onClick, { capture: true });
    window.removeEventListener("resize", onResize);
    bodyObserver.disconnect();
    if (refreshQueued) window.cancelAnimationFrame(refreshQueued);
    if (tick) gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    lenis?.destroy();
    unsubscribe();
    for (const section of addedTabIndex) section.removeAttribute("tabindex");
    for (const section of els) section.style.paddingBottom = "";
    if (debug) {
      debug.scroll = null;
      debug.setExtraScroll = null;
      debug.refreshScroll = null;
    }
    deactivateScroll();
    publishChapterSection(null);
  };
}
