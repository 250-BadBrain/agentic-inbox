import { Button, Loader, Text } from "@cloudflare/kumo";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import api, { get } from "~/services/api";

interface AdminUser {
	id: number;
	github_id: number;
	github_login: string;
	github_avatar: string | null;
	display_name: string | null;
	created_at: string;
	email_count: number;
	emails: string;
}

interface AdminUsersResponse {
	users: AdminUser[];
	totalUsers: number;
	totalEmails: number;
}

interface AdminStats {
	totalUsers: number;
	totalEmails: number;
	totalMailboxes: number;
}

export function meta() {
	return [{ title: "Admin - Agentic Inbox" }];
}

export default function AdminRoute() {
	const navigate = useNavigate();

	const { data: me, isLoading: authLoading } = useQuery({
		queryKey: ["auth", "me"],
		queryFn: () => api.getMe(),
		retry: false,
	});

	const { data: usersData, isLoading: usersLoading } = useQuery({
		queryKey: ["admin", "users"],
		queryFn: () => get<AdminUsersResponse>("/api/admin/users"),
		enabled: !!me,
		retry: false,
	});

	const { data: stats } = useQuery({
		queryKey: ["admin", "stats"],
		queryFn: () => get<AdminStats>("/api/admin/stats"),
		enabled: !!me,
		retry: false,
	});

	if (authLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-kumo-recessed">
				<Loader size="lg" />
			</div>
		);
	}

	if (!me) {
		return (
			<div className="min-h-screen bg-kumo-recessed flex items-center justify-center">
				<Text variant="error">Access denied. Admin only.</Text>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-4xl px-4 py-8">
				<div className="flex items-center justify-between mb-8">
					<h1 className="text-2xl font-bold text-kumo-default">Admin Panel</h1>
					<Button variant="ghost" size="sm" onClick={() => navigate("/")}>
						Back to Home
					</Button>
				</div>

				{/* Stats */}
				{stats && (
					<div className="grid grid-cols-3 gap-4 mb-8">
						<div className="rounded-xl border border-kumo-line bg-kumo-base p-5">
							<div className="text-sm text-kumo-subtle mb-1">Total Users</div>
							<div className="text-3xl font-bold text-kumo-default">{stats.totalUsers}</div>
						</div>
						<div className="rounded-xl border border-kumo-line bg-kumo-base p-5">
							<div className="text-sm text-kumo-subtle mb-1">Total Email Prefixes</div>
							<div className="text-3xl font-bold text-kumo-default">{stats.totalEmails}</div>
						</div>
						<div className="rounded-xl border border-kumo-line bg-kumo-base p-5">
							<div className="text-sm text-kumo-subtle mb-1">R2 Mailboxes</div>
							<div className="text-3xl font-bold text-kumo-default">{stats.totalMailboxes}</div>
						</div>
					</div>
				)}

				{/* Users table */}
				{usersLoading ? (
					<div className="flex justify-center py-10">
						<Loader />
					</div>
				) : usersData ? (
					<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-kumo-line text-left text-kumo-subtle">
									<th className="px-5 py-3 font-medium">User</th>
									<th className="px-5 py-3 font-medium">GitHub ID</th>
									<th className="px-5 py-3 font-medium">Email Prefixes</th>
									<th className="px-5 py-3 font-medium">Created</th>
								</tr>
							</thead>
							<tbody>
								{usersData.users.map((user) => (
									<tr key={user.id} className="border-b border-kumo-line last:border-0">
										<td className="px-5 py-4">
											<div className="flex items-center gap-3">
												{user.github_avatar && (
													<img
														src={user.github_avatar}
														alt=""
														className="w-8 h-8 rounded-full"
													/>
												)}
												<div>
													<div className="font-medium text-kumo-default">
														{user.github_login}
													</div>
													{user.display_name && (
														<div className="text-kumo-subtle text-xs">
															{user.display_name}
														</div>
													)}
												</div>
											</div>
										</td>
										<td className="px-5 py-4 text-kumo-subtle">{user.github_id}</td>
										<td className="px-5 py-4">
											<div className="text-kumo-default font-medium">{user.email_count}</div>
											{user.emails && (
												<div className="text-kumo-subtle text-xs mt-0.5">
													{user.emails}
												</div>
											)}
										</td>
										<td className="px-5 py-4 text-kumo-subtle text-xs">
											{new Date(user.created_at).toLocaleDateString()}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<Text variant="error">Failed to load admin data</Text>
				)}
			</div>
		</div>
	);
}
