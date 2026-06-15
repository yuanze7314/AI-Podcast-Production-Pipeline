import { describe, expect, it } from "vitest";
import { getScriptGraphReview } from "./scriptGraphResult";

describe("getScriptGraphReview", () => {
  it("reads the backend review_report field from script-graph results", () => {
    const reviewReport = {
      id: "review-1",
      status: "success",
      content_json: { pass_review: true },
    };

    expect(getScriptGraphReview({ review_report: reviewReport })).toBe(reviewReport);
  });
});
