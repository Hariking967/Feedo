import { createAuthClient } from "better-auth/react";

function resolveClientOrigin() {
	if (typeof window !== "undefined") {
		return window.location.origin;
	}

	const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
	if (envOrigin) {
		return envOrigin;
	}

	return "http://localhost:3002";
}

export const authClient = createAuthClient({
	baseURL: resolveClientOrigin(),
	basePath: "/api/auth",
	fetchOptions: {
		credentials: "include",
		timeout: 20000,
	},
});

export async function reliableSignOut(redirectTo = "/auth/sign-in") {
	try {
		await authClient.signOut();
	} catch {
		// Continue to redirect even if sign-out endpoint fails.
	}

	if (typeof window !== "undefined") {
		window.location.assign(redirectTo);
	}
}

