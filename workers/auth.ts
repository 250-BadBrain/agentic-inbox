import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "./types";

const COOKIE_NAME = "session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export interface AuthUser {
    id: number;
    github_id: number;
    github_login: string;
    github_avatar: string | null;
    display_name: string | null;
}

export interface AuthContext {
    Bindings: Env;
    Variables: {
        user: AuthUser;
    };
}

async function upsertUser(d1: D1Database, githubUser: { id: number; login: string; avatar_url?: string; name?: string | null }): Promise<AuthUser> {
    const existing = await d1.prepare("SELECT * FROM users WHERE github_id = ?").bind(githubUser.id).first<AuthUser>();
    if (existing) {
        await d1.prepare("UPDATE users SET github_login = ?, github_avatar = ?, github_name = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(githubUser.login, githubUser.avatar_url || null, githubUser.name || null, existing.id).run();
        return { ...existing, github_login: githubUser.login, github_avatar: githubUser.avatar_url || null };
    }
    const result = await d1.prepare(
        "INSERT INTO users (github_id, github_login, github_avatar, github_name) VALUES (?, ?, ?, ?) RETURNING id, github_id, github_login, github_avatar, display_name"
    ).bind(githubUser.id, githubUser.login, githubUser.avatar_url || null, githubUser.name || null).first<AuthUser>();
    return result!;
}

export async function handleGitHubLogin(c: Context<{ Bindings: Env }>) {
    try {
        const state = crypto.randomUUID();
        const redirectTo = c.req.query("redirect") || "/";
        await c.env.D1.prepare("INSERT INTO github_oauth_states (state, redirect_to) VALUES (?, ?)").bind(state, redirectTo).run();
        const url = new URL("https://github.com/login/oauth/authorize");
        url.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID);
        url.searchParams.set("redirect_uri", `${c.env.APP_URL}/api/auth/github/callback`);
        url.searchParams.set("state", state);
        url.searchParams.set("scope", "read:user");
        return c.redirect(url.toString());
    } catch (e) {
        console.error("GitHub login error:", e);
        return c.text(`Login error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

export async function handleGitHubCallback(c: Context<{ Bindings: Env }>) {
    try {
        const code = c.req.query("code");
        const state = c.req.query("state");
        if (!code || !state) return c.text("Missing code or state parameter", 400);

        const stored = await c.env.D1.prepare("SELECT * FROM github_oauth_states WHERE state = ?").bind(state).first<{ state: string; redirect_to: string }>();
        if (!stored) return c.text("Invalid or expired state. Please try logging in again.", 400);
        await c.env.D1.prepare("DELETE FROM github_oauth_states WHERE state = ?").bind(state).run();

        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ client_id: c.env.GITHUB_CLIENT_ID, client_secret: c.env.GITHUB_CLIENT_SECRET, code }),
        });
        const tokenData = await tokenRes.json<{ access_token?: string; error_description?: string }>();
        if (!tokenData.access_token) return c.text(`GitHub token exchange failed: ${tokenData.error_description || "unknown error"}`, 400);

        const userRes = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "agentic-inbox-worker" },
        });
        if (!userRes.ok) return c.text(`GitHub user fetch failed: ${userRes.status}`, 400);
        const githubUser = await userRes.json<{ id: number; login: string; avatar_url?: string; name?: string | null }>();
        const user = await upsertUser(c.env.D1, githubUser);

        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toISOString();
        await c.env.D1.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(sessionId, user.id, expiresAt).run();

        const tokenPayload = JSON.stringify({ sub: user.id, sessionId, exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE });
        const token = btoa(tokenPayload);

        setCookie(c, COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: COOKIE_MAX_AGE, path: "/" });
        return c.html(`<!DOCTYPE html><html><body><p>Login successful. Redirecting...</p><script>window.location.href = '${stored.redirect_to}';</script></body></html>`);
    } catch (e) {
        console.error("GitHub callback error:", e);
        return c.text(`Callback error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
}

export const requireAuth: MiddlewareHandler<AuthContext> = async (c, next) => {
    if (import.meta.env.DEV) {
        const devUser: AuthUser = { id: 1, github_id: 0, github_login: "dev", github_avatar: null, display_name: "Dev User" };
        c.set("user", devUser);
        return next();
    }

    const token = getCookie(c, COOKIE_NAME) || c.req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return c.json({ error: "Authentication required" }, 401);

    try {
        const payload = JSON.parse(atob(token));
        if (payload.exp && Date.now() / 1000 > payload.exp) return c.json({ error: "Session expired" }, 401);

        const session = await c.env.D1.prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ? AND expires_at > ?")
            .bind(payload.sessionId as string, payload.sub as number, new Date().toISOString()).first<{ id: string }>();
        if (!session) return c.json({ error: "Session expired or revoked" }, 401);

        const user = await c.env.D1.prepare("SELECT id, github_id, github_login, github_avatar, display_name FROM users WHERE id = ?")
            .bind(payload.sub as number).first<AuthUser>();
        if (!user) return c.json({ error: "User not found" }, 401);
        c.set("user", user);
    } catch {
        return c.json({ error: "Invalid session" }, 401);
    }

    await next();
};

const ADMIN_GITHUB_LOGIN = "250-BadBrain";

export const requireAdmin: MiddlewareHandler<AuthContext> = async (c, next) => {
	const user = c.var.user;
	if (!user || user.github_login !== ADMIN_GITHUB_LOGIN) {
		return c.json({ error: "Forbidden" }, 403);
	}
	await next();
};

export const optionalAuth: MiddlewareHandler<AuthContext> = async (c, next) => {
    if (import.meta.env.DEV) {
        c.set("user", { id: 1, github_id: 0, github_login: "dev", github_avatar: null, display_name: "Dev User" });
        return next();
    }

    const token = getCookie(c, COOKIE_NAME) || c.req.header("Authorization")?.replace("Bearer ", "");
    if (token) {
        try {
            const payload = JSON.parse(atob(token));
            if (!payload.exp || Date.now() / 1000 <= payload.exp) {
                const user = await c.env.D1.prepare("SELECT id, github_id, github_login, github_avatar, display_name FROM users WHERE id = ?")
                    .bind(payload.sub).first<AuthUser>();
                if (user) c.set("user", user);
            }
        } catch { /* ignore invalid tokens */ }
    }

    await next();
};
