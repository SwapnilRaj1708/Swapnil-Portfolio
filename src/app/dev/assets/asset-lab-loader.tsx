"use client";

import dynamic from "next/dynamic";
import { Container } from "@/components/layout/container";

/**
 * The lab (three.js, React Three Fiber, the loaders) is a lazy chunk, loaded in the browser only:
 * the route's first-load JS carries none of it (the size report checks every route, dev pages too).
 */
const AssetLab = dynamic(() => import("./asset-lab").then((m) => m.AssetLab), {
  ssr: false,
  loading: () => (
    <Container>
      <p className="label-mono text-text-muted">Loading the lab…</p>
    </Container>
  ),
});

export function AssetLabLoader() {
  return <AssetLab />;
}
