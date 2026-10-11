"use client";
import { buttonClass } from "./ui";
export function PrintButton() {
  return (
    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => window.print()}>
      Print / PDF
    </button>
  );
}
