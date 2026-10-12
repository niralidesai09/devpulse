"use client";
import { Printer } from "lucide-react";
import { buttonClass } from "./ui";
export function PrintButton() {
  return (
    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> Print or save PDF
    </button>
  );
}
