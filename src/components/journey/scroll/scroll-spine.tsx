"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { publishChapterSection } from "@/lib/journey/chapter-bridge";
import { CHAPTERS, chapterIndexOfSection } from "@/lib/journey/chapters";
import { countRender, journeyDebug } from "@/lib/journey/debug";
import { chapterBoundaries, locateChapter, maxScrollOf, scrollToProgress, type ChapterLocation } from "@/lib/journey/scroll-math";
import { cameraDamped, chooseScrollMode, parseSmoothOverride, type ScrollMode } from "@/lib/journey/scroll-mode";
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
 *     header, update the URL and move focus to the section. Instant under reduced motion.
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

const overrideAllowed = () => process.env.JOURNEY_TIER_OVERRIDE === "on";

function matches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

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
    smoothOverride: parseSmoothOverride(window.location.search, overrideAllowed()),
    finePointer: matches("(pointer: fine)"),
  });

  // --- Measuring -------------------------------------------------------------------------------
  const boundaries: number[] = [];
  const tops: number[] = [];
  const location: ChapterLocation = { index: 0, progress: 0 };
  let max = 0;
  let padding = 0;

  const applyExtraScroll = () => {
    CHAPTERS.forEach((c, i) => {
      const extra = c.extraScroll > 0 ? c.extraScroll : 0;
      els[i].style.paddingBottom = extra ? `calc(${extra} * 100svh)` : "";
    });
  };

  const measure = () => {
    const scroller = document.scrollingElement ?? root;
    max = maxScrollOf(scroller.scrollHeight, scroller.clientHeight);
    padding = Number.parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    const y = window.scrollY;
    tops.length = els.length;
    for (let i = 0; i < els.length; i++) tops[i] = els[i].getBoundingClientRect().top + y;
    chapterBoundaries(tops, padding, max, boundaries);
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

  // --- ScrollTrigger: updates and refreshes -----------------------------------------------------
  // Killed in the teardown below (it may be created a frame after useGSAP's context recorded).
  const trigger = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: update,
    onRefresh: () => {
      measure();
      update();
    },
  });
  let refreshQueued = 0;
  const queueRefresh = () => {
    if (refreshQueued) return;
    refreshQueued = window.requestAnimationFrame(() => {
      refreshQueued = 0;
      ScrollTrigger.refresh();
    });
  };
  const bodyObserver = new ResizeObserver(queueRefresh);
  bodyObserver.observe(document.body);
  // The viewport height alone (a phone's address bar, a rotation) changes the maximum: re-measure
  // at once (ScrollTrigger itself ignores address-bar resizes on touch devices).
  const onResize = () => {
    measure();
    update();
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
  const addedTabIndex = new Set<HTMLElement>();
  let pendingFocus: (() => void) | null = null;
  const focusSection = (index: number) => {
    const section = els[index];
    if (!section.hasAttribute("tabindex")) {
      section.setAttribute("tabindex", "-1");
      addedTabIndex.add(section);
    }
    section.focus({ preventScroll: true });
  };
  const jumpTo = (index: number) => {
    const target = boundaries[index];
    const instant = matches(REDUCED_MOTION_QUERY);
    const done = () => focusSection(index);
    if (lenis) {
      lenis.scrollTo(target, { immediate: instant, force: true, onComplete: done });
      return;
    }
    if (Math.abs(window.scrollY - target) < 1) {
      window.scrollTo({ top: target, behavior: "instant" });
      done();
      return;
    }
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener("scrollend", finish);
      pendingFocus = null;
      done();
    };
    pendingFocus?.();
    pendingFocus = () => {
      window.clearTimeout(timer);
      window.removeEventListener("scrollend", finish);
    };
    window.addEventListener("scrollend", finish, { passive: true });
    timer = window.setTimeout(finish, 3000);
    window.scrollTo({ top: target, behavior: instant ? "instant" : "smooth" });
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
    ScrollTrigger.refresh();
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
        scrollPadding: padding,
      };
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
    trigger.kill();
    pendingFocus?.();
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
    }
    deactivateScroll();
    publishChapterSection(null);
  };
}
