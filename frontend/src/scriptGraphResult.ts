type ScriptGraphReviewShape<TReview> = {
  review_report?: TReview | null;
  review?: TReview | null;
};

export function getScriptGraphReview<TReview>(
  result: ScriptGraphReviewShape<TReview>,
): TReview | null {
  return result.review_report ?? result.review ?? null;
}
