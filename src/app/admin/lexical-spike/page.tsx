import type { Metadata } from "next";
import { LexicalSpikeEditor } from "@/components/LexicalSpikeEditor";

export const metadata: Metadata = {
  title: "Lexical spike | Admin",
  description: "Phase 0 editor framework migration spike (FB-09 / FB-29).",
};

export default function LexicalSpikePage() {
  return (
    <div className="admin-page">
      <h1>Lexical spike (Phase 0)</h1>
      <p className="meta">
        Throwaway admin route for FB-09/FB-29. Not used by the live page editor until Phase 1.
      </p>
      <LexicalSpikeEditor />
    </div>
  );
}
