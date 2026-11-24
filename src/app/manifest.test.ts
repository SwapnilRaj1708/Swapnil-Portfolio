import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web manifest (PF-028)", () => {
  it("names the site, uses the background colour and lists the 192 and 512 px icons", () => {
    expect(manifest()).toEqual({
      name: "Swapnil Raj – Full-Stack Engineer",
      short_name: "Swapnil Raj",
      description: "I build fast, real-time web products that people actually use.",
      start_url: "/",
      display: "browser",
      theme_color: "#07090c",
      background_color: "#07090c",
      icons: [
        { src: "/icon1.png", sizes: "192x192", type: "image/png" },
        { src: "/icon2.png", sizes: "512x512", type: "image/png" },
      ],
    });
  });
});
