
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/(app)" | "/" | "/(app)/admin" | "/api" | "/api/auth" | "/api/my-tasks" | "/api/projects" | "/api/projects/[id]" | "/api/projects/[id]/attachments" | "/api/projects/[id]/attachments/[attachmentId]" | "/api/projects/[id]/phases" | "/api/projects/[id]/wbs" | "/api/users" | "/login" | "/(app)/my-tasks" | "/(app)/projects" | "/(app)/projects/[id]";
		RouteParams(): {
			"/api/projects/[id]": { id: string };
			"/api/projects/[id]/attachments": { id: string };
			"/api/projects/[id]/attachments/[attachmentId]": { id: string; attachmentId: string };
			"/api/projects/[id]/phases": { id: string };
			"/api/projects/[id]/wbs": { id: string };
			"/(app)/projects/[id]": { id: string }
		};
		LayoutParams(): {
			"/(app)": { id?: string };
			"/": { id?: string; attachmentId?: string };
			"/(app)/admin": Record<string, never>;
			"/api": { id?: string; attachmentId?: string };
			"/api/auth": Record<string, never>;
			"/api/my-tasks": Record<string, never>;
			"/api/projects": { id?: string; attachmentId?: string };
			"/api/projects/[id]": { id: string; attachmentId?: string };
			"/api/projects/[id]/attachments": { id: string; attachmentId?: string };
			"/api/projects/[id]/attachments/[attachmentId]": { id: string; attachmentId: string };
			"/api/projects/[id]/phases": { id: string };
			"/api/projects/[id]/wbs": { id: string };
			"/api/users": Record<string, never>;
			"/login": Record<string, never>;
			"/(app)/my-tasks": Record<string, never>;
			"/(app)/projects": { id?: string };
			"/(app)/projects/[id]": { id: string }
		};
		Pathname(): "/" | "/admin" | "/api/auth" | "/api/my-tasks" | "/api/projects" | `/api/projects/${string}` & {} | `/api/projects/${string}/attachments` & {} | `/api/projects/${string}/attachments/${string}` & {} | `/api/projects/${string}/phases` & {} | `/api/projects/${string}/wbs` & {} | "/api/users" | "/login" | "/my-tasks" | "/projects" | `/projects/${string}` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}