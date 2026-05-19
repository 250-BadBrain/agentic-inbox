// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { MailboxDO } from "./durableObject";
import type { EmailAgent } from "./agent";
import type { EmailMCP } from "./mcp";

export interface Env extends Cloudflare.Env {
	[key: string]: unknown;
	DOMAINS: string | string[];
	EMAIL_ADDRESSES: string[] | string;
	BUCKET: R2Bucket;
	EMAIL: SendEmail;
	MAILBOX: DurableObjectNamespace<MailboxDO>;
	EMAIL_AGENT: DurableObjectNamespace<EmailAgent>;
	EMAIL_MCP: DurableObjectNamespace<EmailMCP>;
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
}
