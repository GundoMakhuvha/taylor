import { unseal } from "@/lib/server/crypto";
import { getPost, imageUrl, platforms } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approve post · Taylor", robots: { index: false } };

export default async function ApprovePost({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; done?: string }>;
}) {
  const { id } = await params;
  const { t = "", done } = await searchParams;
  const ok = unseal<{ pid: string }>(t)?.pid === id;
  const post = ok ? await getPost(id).catch(() => null) : null;

  if (!post)
    return (
      <main className="approve">
        <h1>Link expired</h1>
        <p>Open Taylor and ask for today&rsquo;s post instead.</p>
      </main>
    );

  const final = ["published", "partial", "failed", "skipped"].includes(post.status);
  return (
    <main className="approve">
      <p className="approve-tag">TAYLOR · SOCIAL AUTOPILOT · {post.day}</p>
      <h1>{post.headline}</h1>
      {done && (
        <p className={`approve-done ${done}`} role="status">
          {done === "published" ? "Published." : done === "partial" ? "Published to some platforms; see below." : done === "skipped" ? "Skipped. Nothing was posted." : "Publishing failed; see below."}
        </p>
      )}
      <img src={imageUrl(post.id)} alt={`${post.headline}. ${post.subline}`} width={1080} height={1350} />
      <section>
        <h2>Instagram</h2>
        <p>{post.captions.instagram}</p>
        <h2>Facebook</h2>
        <p>{post.captions.facebook}</p>
        <h2>TikTok</h2>
        <p>{post.captions.tiktok}</p>
      </section>
      {post.results && (
        <ul className="approve-results">
          {Object.entries(post.results).map(([k, v]) => (
            <li key={k}>
              <strong>{k}</strong>: {v}
            </li>
          ))}
        </ul>
      )}
      {!final && (
        <form method="post" action={`/api/social/posts/${post.id}`} className="approve-btns">
          <input type="hidden" name="t" value={t} />
          <button type="submit" name="action" value="skip" className="btn-secondary">
            Skip today
          </button>
          <button type="submit" name="action" value="publish" className="btn-primary">
            Publish to {platforms().join(", ")}
          </button>
        </form>
      )}
    </main>
  );
}
