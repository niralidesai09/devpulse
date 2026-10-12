// Ask: question answering grounded only in stored discussions.

import type { Metadata } from "next";
import { AskPulse } from "@/components/ask-pulse";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Ask" };

export default function AskPage() {
  return (
    <main className="mx-auto max-w-[900px] space-y-8 px-5 py-6 lg:px-10 lg:py-8">
      <PageHeader
        title="Ask the Pulse"
        description={
          <p>
            Ask a question about what developers are saying. Groundswell searches the discussions it has collected and the AI answers only from
            those, citing each one. If nothing relevant is stored, it says so instead of guessing.
          </p>
        }
      />
      <AskPulse />
    </main>
  );
}
