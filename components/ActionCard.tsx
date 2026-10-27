"use client";

export type ActionCardData = { token: string; title: string; lines: { label: string; value: string }[] };
export type ActionState = ActionCardData & { status: "pending" | "running" | "done" | "cancelled" | "error"; result?: string };

export function ActionCard({ a, onConfirm, onCancel }: { a: ActionState; onConfirm: () => void; onCancel: () => void }) {
  return (
    <section className={`action ${a.status}`} aria-label={a.title}>
      <header>
        <span className="action-tag">{a.status === "done" ? "COMPLETE" : a.status === "cancelled" ? "CANCELLED" : a.status === "error" ? "FAILED" : "AWAITING CONFIRMATION"}</span>
        <h3>{a.title}</h3>
      </header>
      <dl>
        {a.lines.map((l, i) => (
          <div key={i}>
            <dt>{l.label}</dt>
            <dd>{l.value}</dd>
          </div>
        ))}
      </dl>
      {a.result && <p className="action-result" role="status">{a.result}</p>}
      {(a.status === "pending" || a.status === "running") && (
        <div className="action-btns">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={a.status === "running"}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={a.status === "running"}>
            {a.status === "running" ? "Working…" : "Confirm"}
          </button>
        </div>
      )}
    </section>
  );
}
