<script lang="ts">
    import type { ActionData, PageData } from "./$types";
    import { BasicForm } from "@sjsf/form";
    import { createMeta, setupSvelteKitForm } from "@sjsf/sveltekit/client";
    import * as defaults from "$lib/components/settings/form-defaults";
    import { setShadcnContext } from "$lib/components/shadcn-context";
    import RankingSettingsEditor from "$lib/components/settings/ranking-settings-editor.svelte";
    import { toast } from "svelte-sonner";
    import { icons } from "@sjsf/lucide-icons";
    setShadcnContext();

    let { data }: { data: PageData } = $props();

    const meta = createMeta<ActionData, PageData>().form;

    // @ts-expect-error - Schema is provided by page data
    const { form, request } = setupSvelteKitForm(meta, {
        ...defaults,
        icons,
        delayedMs: 500,
        timeoutMs: 30000,
        onSuccess: (result) => {
            if (result.type === "success") {
                toast.success("Settings saved");
            } else {
                toast.error("Failed to save settings");
            }
        },
        onFailure: () => {
            toast.error("Something went wrong while saving settings");
        }
    });

</script>

<svelte:head>
    <title>Settings - Riven</title>
</svelte:head>

<!-- Client-only wrapper to avoid SSR hydration issues -->
<div class="mt-14 h-full w-full space-y-6 p-6 md:p-8 md:px-16">
    <RankingSettingsEditor initial={data.rankingSettings} />
    <div class="rounded-xl border border-border/70 bg-card/30 p-4">
        <BasicForm {form} method="POST" />
    </div>
</div>
