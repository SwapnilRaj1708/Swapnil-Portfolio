// Dev-only page: built only with ENABLE_DEV_PAGES=1 (see next.config.ts). Never in production.
// The asset pipeline's test route (PF-009): the contract test piece `shared/pipeline-test`, loaded
// through the site's own loaders, with every contract feature on view.
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AssetLabLoader } from "./asset-lab-loader";

export const metadata: Metadata = { title: "Asset lab" };

export default function AssetLabPage() {
  return (
    <>
      <PageHeader
        kicker="DEV · PF-009"
        title="Asset lab"
        intro="The contract test piece through the site's own loaders: material prefixes, empties, instancing, the clip, tier variants, progress and disposal."
      />
      <AssetLabLoader />
    </>
  );
}
