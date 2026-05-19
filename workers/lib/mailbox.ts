import { createMiddleware } from "hono/factory";
import type { MailboxDO } from "../durableObject";
import type { Env } from "../types";

export type MailboxContext = {
	Bindings: Env;
	Variables: {
		mailboxStub: DurableObjectStub<MailboxDO>;
	};
};

export const requireMailbox = createMiddleware<MailboxContext>(async (c, next) => {
	const rawId = c.req.param("mailboxId");
	if (!rawId) return c.json({ error: "Mailbox ID required" }, 400);
	const mailboxId = decodeURIComponent(rawId);

	const key = `mailboxes/${mailboxId}.json`;
	const obj = await c.env.BUCKET.head(key);
	if (!obj) {
		return c.json({ error: "Not found" }, 404);
	}

	const ns = c.env.MAILBOX;
	const id = ns.idFromName(mailboxId);
	const stub = ns.get(id);

	c.set("mailboxStub", stub);

	await next();
});

export const requireMailboxOwnership = createMiddleware<{
	Bindings: Env;
	Variables: {
		user: { id: number };
	};
}>(async (c, next) => {
	const rawId = c.req.param("mailboxId");
	if (!rawId) return c.json({ error: "Mailbox ID required" }, 400);
	const mailboxId = decodeURIComponent(rawId);
	const user = c.var.user;

	if (import.meta.env.DEV) return next();

	const owned = await c.env.D1.prepare(
		"SELECT id FROM user_emails WHERE full_email = ? AND user_id = ? AND is_active = 1"
	).bind(mailboxId.toLowerCase(), user.id).first();
	if (!owned) return c.json({ error: "Mailbox not found or access denied" }, 404);

	await next();
});
