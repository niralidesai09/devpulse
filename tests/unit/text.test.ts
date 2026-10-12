import { describe, expect, it } from "vitest";
import { cleanText, containsPhrase, excerptAround, isSafeHttpUrl, isVerbatimQuote, matchKeywords, normalizeUrl } from "@/lib/text";

describe("cleanText", () => {
  it("strips tags, decodes entities and collapses whitespace", () => {
    expect(cleanText("<p>Flaky&nbsp;tests &amp; <b>CI</b>\n\n&#x27;again&#39;</p>")).toBe("Flaky tests & CI 'again'");
  });
  it("caps length with an ellipsis", () => {
    expect(cleanText("a".repeat(20), 10)).toBe("aaaaaaaaa…");
  });
  it("survives invalid code points", () => {
    expect(cleanText("x &#99999999; y")).toBe("x y");
  });
});

describe("containsPhrase / matchKeywords", () => {
  it("matches case-insensitively across whitespace and plurals", () => {
    expect(containsPhrase("Our Flaky  Tests keep failing", "flaky test")).toBe(true);
  });
  it("respects word boundaries", () => {
    expect(containsPhrase("the contest retry button", "test retry")).toBe(false);
    expect(containsPhrase("PR sizing guide", "PR size")).toBe(false);
  });
  it("escapes regex characters in keywords", () => {
    expect(containsPhrase("we use C++ linters", "C++ linters")).toBe(true);
  });
  it("returns every keyword once, even when listed twice", () => {
    const refs = [
      { keyword: "flaky tests", topicId: "t1" },
      { keyword: "slow CI", topicId: "t2" },
      { keyword: "Flaky Tests", topicId: "t1" },
    ];
    expect(matchKeywords("Flaky tests make slow CI worse", refs)).toEqual([refs[0], refs[1]]);
  });
});

describe("normalizeUrl", () => {
  it("removes tracking params, fragments, www and trailing slashes", () => {
    expect(normalizeUrl("http://www.Example.com/a/b/?utm_source=x&b=2&a=1#frag")).toBe("https://example.com/a/b?a=1&b=2");
  });
  it("keeps meaningful query params (HN item ids)", () => {
    expect(normalizeUrl("https://news.ycombinator.com/item?id=1")).not.toBe(normalizeUrl("https://news.ycombinator.com/item?id=2"));
  });
  it("returns the input when it is not a URL", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("excerptAround", () => {
  it("centres the excerpt on the keyword when it is far into the text", () => {
    const text = "x ".repeat(800) + "the review backlog is huge " + "y ".repeat(800);
    const ex = excerptAround(text, "review backlog", 300);
    expect(ex).toContain("review backlog");
    expect(ex.length).toBeLessThanOrEqual(300);
  });
});

describe("isSafeHttpUrl", () => {
  it("only allows http(s)", () => {
    expect(isSafeHttpUrl("https://github.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,x")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });
});

describe("isVerbatimQuote", () => {
  const source = "Honestly the CodeRabbit comments are 90% nitpicks and we’ve stopped reading them.";
  it("accepts an exact substring (case/quote-style insensitive)", () => {
    expect(isVerbatimQuote("we've stopped reading them", source)).toBe(true);
  });
  it("rejects paraphrases and too-short quotes", () => {
    expect(isVerbatimQuote("we no longer read the comments", source)).toBe(false);
    expect(isVerbatimQuote("nitpicks", source)).toBe(false);
  });
});

import { readableExcerpt } from "@/lib/text";

describe("readableExcerpt (display only)", () => {
  it("removes Markdown noise but keeps the words", () => {
    expect(readableExcerpt("## Dependencies - Parent: #81 - [ ] Write `flaky test` [docs](https://x.y) **now**")).toBe(
      "Dependencies Parent: #81 Write flaky test docs now",
    );
  });
});
