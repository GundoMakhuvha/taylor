// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
export function cronAllowed(req: Request) {
  const s = process.env.CRON_SECRET;
  return Boolean(s) && req.headers.get("authorization") === `Bearer ${s}`;
}
