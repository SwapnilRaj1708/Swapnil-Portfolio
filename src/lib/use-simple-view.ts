"use client";

import { useSyncExternalStore } from "react";
import { getSimpleView, subscribeSimpleView } from "./simple-view";

const serverSnapshot = () => false;

/** React binding for the simple-view store. Renders `false` on the server and during hydration. */
export function useSimpleView(): boolean {
  return useSyncExternalStore(subscribeSimpleView, getSimpleView, serverSnapshot);
}
