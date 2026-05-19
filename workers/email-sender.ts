export interface SendEmailParams {
    to: string | string[];
    from: string | { email: string; name: string };
    subject: string;
    html?: string;
    text?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string | { email: string; name: string };
    attachments?: {
        content: string;
        filename: string;
        type: string;
        disposition: "attachment" | "inline";
        contentId?: string;
    }[];
    headers?: Record<string, string>;
}

export async function sendEmail(
    resendApiKey: string,
    params: SendEmailParams,
): Promise<{ messageId: string }> {
    const payload: Record<string, unknown> = {
        from: typeof params.from === "string" ? params.from : `${params.from.name} <${params.from.email}>`,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
    };

    if (params.html) payload.html = params.html;
    if (params.text) payload.text = params.text;
    if (params.cc) payload.cc = Array.isArray(params.cc) ? params.cc : [params.cc];
    if (params.bcc) payload.bcc = Array.isArray(params.bcc) ? params.bcc : [params.bcc];
    if (params.replyTo) {
        payload.reply_to = typeof params.replyTo === "string" ? params.replyTo : params.replyTo.email;
    }
    if (params.attachments?.length) {
        payload.attachments = params.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            content_type: a.type,
            disposition: a.disposition,
            ...(a.contentId ? { content_id: a.contentId } : {}),
        }));
    }

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend API error ${res.status}: ${err}`);
    }

    const data = await res.json<{ id: string }>();
    return { messageId: data.id };
}
