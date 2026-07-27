/**
 * Quiet, opt-in reader tips — collapsed by default, no popup or invite banner.
 */
export function ReaderTips({
  tips,
}: {
  tips: Array<{ title: string; body: string }>;
}) {
  if (tips.length === 0) {
    return null;
  }

  return (
    <details className="reader-tips">
      <summary className="reader-tips__summary">Reader tips</summary>
      <ul className="reader-tips__list">
        {tips.map((tip) => (
          <li key={tip.title}>
            <strong>{tip.title}.</strong> {tip.body}
          </li>
        ))}
      </ul>
    </details>
  );
}
