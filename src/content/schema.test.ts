import { describe, expect, it } from "vitest";
import { contactFlow } from "./data/contact-flow";
import { education, experience, services, skills } from "./data/career";
import { about, identity } from "./data/identity";
import { projects } from "./data/projects";
import { homeSections, site } from "./data/site";
import { ui } from "./data/ui";
import { content } from "./index";
import { ContentError, parseContent, parseUi } from "./validate";

/** A fresh, deep copy of the real content data – each test breaks one thing in it. */
function validInput() {
  return structuredClone({
    identity,
    about,
    experience,
    education,
    skills,
    services,
    projects,
    contactFlow,
    site,
    homeSections,
  });
}

/** Runs parseContent and returns the error message (fails the test if nothing is thrown). */
function errorFor(input: unknown): string {
  try {
    parseContent(input);
  } catch (err) {
    expect(err).toBeInstanceOf(ContentError);
    return (err as Error).message;
  }
  throw new Error("expected the content to be rejected");
}

describe("content schema", () => {
  it("accepts the real content", () => {
    expect(() => parseContent(validInput())).not.toThrow();
    expect(content.projects).toHaveLength(8);
    expect(content.experience).toHaveLength(3);
    expect(content.skills).toHaveLength(4);
    expect(content.services).toHaveLength(3);
  });

  it("rejects a missing required field and names it", () => {
    const input = validInput();
    delete (input.projects[0] as Partial<(typeof input.projects)[0]>).role;
    const message = errorFor(input);
    expect(message).toContain("Invalid content");
    expect(message).toMatch(/expected string, received undefined/);
    expect(message).toContain("projects[0].role");
  });

  it("rejects a wrong type and names the field", () => {
    const input = validInput() as unknown as { projects: { stack: unknown }[] };
    input.projects[2].stack = "Next.js, CMS";
    const message = errorFor(input);
    expect(message).toMatch(/expected array, received string/);
    expect(message).toContain("projects[2].stack");
  });

  it("rejects an unknown (misspelt) key", () => {
    const input = validInput() as unknown as { identity: Record<string, unknown> };
    input.identity.pitchh = "typo";
    expect(errorFor(input)).toMatch(/Unrecognized key: "pitchh"/);
  });

  it("enforces the BRIEF §8 limits: pitch ≤ 12 words, ≤ 4 skill groups of ≤ 6, ≤ 3 services", () => {
    const longPitch = validInput();
    longPitch.identity.pitch = "one two three four five six seven eight nine ten eleven twelve thirteen";
    expect(errorFor(longPitch)).toContain("12 words or fewer");

    const groups = validInput();
    groups.skills.push({ name: "Extra", items: ["x"] });
    expect(errorFor(groups)).toContain("four groups at most");

    const entries = validInput();
    entries.skills[0].items.push("Seventh");
    expect(errorFor(entries)).toContain("six entries at most");

    const svc = validInput();
    svc.services.push({ title: "Fourth", line: "x" });
    expect(errorFor(svc)).toContain("three at most");
  });

  it("requires an outcome for featured projects, unique slugs and https links", () => {
    const outcome = validInput();
    delete (outcome.projects[0] as { outcome?: string[] }).outcome;
    expect(errorFor(outcome)).toContain("a featured project must state an outcome");

    const dup = validInput();
    dup.projects[1].slug = dup.projects[0].slug;
    expect(errorFor(dup)).toContain('duplicate slug "twizzr"');

    const http = validInput();
    http.projects[0].links.live = "http://twizzr.in";
    expect(errorFor(http)).toContain("must be an https:// URL");
  });

  it("requires media in the project's own folder with alt text", () => {
    const folder = validInput();
    folder.projects[0].media[0].src = "/media/projects/creo/home.webp";
    expect(errorFor(folder)).toContain("project's own folder");

    const alt = validInput();
    alt.projects[0].media[0].alt = " ";
    expect(errorFor(alt)).toMatch(/must not be empty[\s\S]*projects\[0\]\.media\[0\]\.alt/);
  });

  it("marks no public preview only on projects without media, with a known reason", () => {
    const withMedia = validInput();
    (withMedia.projects[0] as { noPublicPreview?: string }).noPublicPreview = "behind-sign-in";
    expect(errorFor(withMedia)).toMatch(/has a preview[\s\S]*projects\[0\]\.noPublicPreview/);

    const unknownReason = validInput();
    const softboard = unknownReason.projects.findIndex((p) => p.slug === "softboard-lite");
    (unknownReason.projects[softboard] as { noPublicPreview?: string }).noPublicPreview = "offline";
    expect(errorFor(unknownReason)).toContain(`projects[${softboard}].noPublicPreview`);
  });

  it("carries the owner's roles for the reviewed projects (PF-006 review, 2026-11-23)", () => {
    const role = (slug: string) => projects.find((p) => p.slug === slug)?.role;
    expect(role("softboard-lite")).toBe("Frontend engineer");
    for (const slug of ["pg-gurukul", "creo", "letschat", "windows-10-clone", "recall"]) {
      expect(role(slug)).toBe("Solo developer: design and build");
    }
    expect(role("engineerhub")).toBe("Software Development Intern");
    expect(projects.filter((p) => "noPublicPreview" in p).map((p) => p.slug)).toEqual(["softboard-lite", "letschat", "recall"]);
  });

  it("rejects bad dates", () => {
    const input = validInput();
    (input.experience[0] as { start: string }).start = "April 2025";
    expect(errorFor(input)).toContain('must be "YYYY-MM"');
  });

  it("rejects an empty interface label", () => {
    expect(() => parseUi({ hero: { workCta: "" } })).toThrow(/must not be empty[\s\S]*hero\.workCta/);
    expect(() => parseUi(ui)).not.toThrow();
  });
});
