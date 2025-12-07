<script lang="ts">
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Separator } from "$lib/components/ui/separator";
    import { toast } from "svelte-sonner";
    import { getAllSettings, setSettings } from "$lib/api";
    import type {
        CustomRanksConfig,
        LanguagesConfig,
        OptionsConfig,
        ResolutionConfig,
        RtnSettingsModel
    } from "$lib/api/types.gen";

    type CustomRank = NonNullable<CustomRanksConfig[keyof CustomRanksConfig]>[keyof NonNullable<
        CustomRanksConfig[keyof CustomRanksConfig]
    >];

    type RankingProfileSettings = RtnSettingsModel & {
        keep_versions_per_item?: number;
    };

    type PathProfileMapping = {
        path: string;
        profile_name: string;
    };

    export type RankingSettings = {
        default_profile: string;
        keep_versions_per_item: number;
        profiles: Record<string, RankingProfileSettings>;
        path_profiles: PathProfileMapping[];
    };

    export let initial: RankingSettings;

    const RESOLUTION_KEYS = ["r2160p", "r1080p", "r720p", "r480p", "r360p", "unknown"] as const;
    const OPTION_BOOL_KEYS: Array<keyof OptionsConfig> = [
        "remove_all_trash",
        "remove_unknown_languages",
        "allow_english_in_languages",
        "enable_fetch_speed_mode",
        "remove_adult_content"
    ];

    const CUSTOM_SECTIONS: Record<string, string[]> = {
        quality: ["av1", "avc", "bluray", "dvd", "hdtv", "hevc", "mpeg", "remux", "vhs", "web", "webdl", "webmux", "xvid"],
        rips: ["bdrip", "brrip", "dvdrip", "hdrip", "ppvrip", "satrip", "tvrip", "uhdrip", "vhsrip", "webdlrip", "webrip"],
        hdr: ["bit10", "dolby_vision", "hdr", "hdr10plus", "sdr"],
        audio: ["aac", "atmos", "dolby_digital", "dolby_digital_plus", "dts_lossy", "dts_lossless", "flac", "mono", "mp3", "stereo", "surround", "truehd"],
        extras: ["3d", "converted", "documentary", "dubbed", "edition", "hardcoded", "network", "proper", "repack", "retail", "site", "subbed", "upscaled", "scene", "uncensored"],
        trash: ["cam", "clean_audio", "pdtv", "r5", "screener", "size", "telecine", "telesync"]
    };

    const emptyRank = (): CustomRank => ({
        fetch: false,
        use_custom_rank: false,
        rank: undefined
    });

    const hydrateCustomRanks = (input?: CustomRanksConfig): CustomRanksConfig => {
        const output: CustomRanksConfig = {
            quality: {},
            rips: {},
            hdr: {},
            audio: {},
            extras: {},
            trash: {}
        };
        for (const section of Object.keys(CUSTOM_SECTIONS)) {
            const sectionKey = section as keyof CustomRanksConfig;
            const existing = input?.[sectionKey] ?? {};
            const target: Record<string, CustomRank> = {};
            for (const key of CUSTOM_SECTIONS[section]) {
                target[key] = { ...emptyRank(), ...(existing as Record<string, CustomRank>)[key] };
            }
            output[sectionKey] = target;
        }
        return output;
    };

    const hydrateResolutions = (resolutions?: ResolutionConfig): ResolutionConfig => {
        const defaults: ResolutionConfig = {};
        for (const key of RESOLUTION_KEYS) {
            defaults[key] = resolutions?.[key] ?? false;
        }
        return defaults;
    };

    const hydrateOptions = (options?: OptionsConfig): OptionsConfig => ({
        title_similarity: options?.title_similarity ?? 0,
        remove_all_trash: options?.remove_all_trash ?? false,
        remove_ranks_under: options?.remove_ranks_under ?? 0,
        remove_unknown_languages: options?.remove_unknown_languages ?? false,
        allow_english_in_languages: options?.allow_english_in_languages ?? false,
        enable_fetch_speed_mode: options?.enable_fetch_speed_mode ?? false,
        remove_adult_content: options?.remove_adult_content ?? false
    });

    const hydrateLanguages = (languages?: LanguagesConfig): LanguagesConfig => ({
        required: languages?.required ?? [],
        exclude: languages?.exclude ?? [],
        preferred: languages?.preferred ?? []
    });

    const formatCSV = (arr?: string[]) => (arr && arr.length ? arr.join(", ") : "");
    const parseCSV = (val: string) =>
        val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

    const hydrateProfile = (profile?: RankingProfileSettings): RankingProfileSettings => ({
        name: profile?.name ?? "",
        enabled: profile?.enabled ?? true,
        require: profile?.require ?? [],
        exclude: profile?.exclude ?? [],
        preferred: profile?.preferred ?? [],
        resolutions: hydrateResolutions(profile?.resolutions),
        options: hydrateOptions(profile?.options),
        languages: hydrateLanguages(profile?.languages),
        custom_ranks: hydrateCustomRanks(profile?.custom_ranks),
        keep_versions_per_item: profile?.keep_versions_per_item
    });

    const hydrateSettings = (settings: RankingSettings): RankingSettings => {
        const profiles: Record<string, RankingProfileSettings> = {};
        Object.entries(settings.profiles || { default: hydrateProfile() }).forEach(([name, profile]) => {
            profiles[name] = hydrateProfile(profile as RankingProfileSettings);
        });
        const defaultProfile = settings.default_profile && profiles[settings.default_profile] ? settings.default_profile : Object.keys(profiles)[0];
        return {
            default_profile: defaultProfile,
            keep_versions_per_item: settings.keep_versions_per_item || 1,
            profiles,
            path_profiles: settings.path_profiles || []
        };
    };

    let settings = hydrateSettings(initial);
    let activeProfile = settings.default_profile || Object.keys(settings.profiles)[0] || "default";
    let saving = false;

    const ensureActiveProfile = () => {
        if (!settings.profiles[activeProfile]) {
            activeProfile = settings.default_profile || Object.keys(settings.profiles)[0];
        }
    };

    const addProfile = () => {
        const name = prompt("New profile name")?.trim();
        if (!name) return;
        if (settings.profiles[name]) {
            toast.error("Profile already exists");
            return;
        }
        const cloneSource = settings.profiles[activeProfile] ?? hydrateProfile();
        settings.profiles = { ...settings.profiles, [name]: hydrateProfile(cloneSource) };
        activeProfile = name;
        settings = { ...settings };
    };

    const deleteProfile = (name: string) => {
        if (name === "default") {
            toast.error("Cannot delete default profile");
            return;
        }
        const { [name]: _, ...rest } = settings.profiles;
        settings.profiles = rest;
        settings.path_profiles = settings.path_profiles.filter((mapping) => mapping.profile_name !== name);
        if (settings.default_profile === name) {
            settings.default_profile = Object.keys(rest)[0] || "default";
        }
        activeProfile = settings.default_profile;
        ensureActiveProfile();
        settings = { ...settings };
    };

    const addMapping = () => {
        settings.path_profiles = [
            ...settings.path_profiles,
            {
                path: "",
                profile_name: activeProfile
            }
        ];
        settings = { ...settings };
    };

    const updateCustomRank = (section: keyof CustomRanksConfig, key: string, field: keyof CustomRank, value: any) => {
        const profile = settings.profiles[activeProfile];
        profile.custom_ranks = profile.custom_ranks ?? hydrateCustomRanks();
        const targetSection = (profile.custom_ranks[section] ?? {}) as Record<string, CustomRank>;
        const current = targetSection[key] ?? emptyRank();
        targetSection[key] = { ...current, [field]: value };
        profile.custom_ranks[section] = targetSection;
        settings = { ...settings };
    };

    const save = async () => {
        saving = true;
        try {
            const result = await setSettings({
                body: [
                    {
                        key: "ranking",
                        value: settings
                    }
                ]
            });

            if (!result || (result as any).error) {
                console.error("setSettings failed", (result as any)?.error);
                toast.error((result as any)?.error?.message || "Failed to save ranking settings");
                return;
            }

            const refreshed = await getAllSettings();
            if (refreshed.error) {
                toast.error(
                    refreshed.error.message || "Saved, but failed to reload ranking settings"
                );
            } else if (refreshed.data?.ranking) {
                settings = hydrateSettings(refreshed.data.ranking as RankingSettings);
                activeProfile =
                    settings.default_profile ||
                    Object.keys(settings.profiles)[0] ||
                    activeProfile;
                ensureActiveProfile();
            }

            toast.success("Ranking settings saved");
        } catch (err) {
            toast.error("Failed to save ranking settings");
        } finally {
            saving = false;
        }
    };
</script>

<div class="space-y-6 rounded-xl border border-border bg-card/40 p-6 shadow-md">
    <div class="flex items-center justify-between gap-4">
        <div>
            <p class="text-lg font-semibold">Ranking & Versions</p>
            <p class="text-sm text-muted-foreground">
                Manage profiles, path mappings, and how many versions to keep per item.
            </p>
        </div>
        <div class="flex items-center gap-2">
            <button
                type="button"
                class="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                on:click={addProfile}>
                Add profile
            </button>
            <button
                type="button"
                class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:brightness-110 disabled:opacity-50"
                disabled={saving}
                on:click={save}>
                {saving ? "Saving..." : "Save"}
            </button>
        </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
            <Label>Default profile</Label>
            <select
                class="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                value={settings.default_profile}
                on:change={(e) => {
                    settings.default_profile = (e.currentTarget as HTMLSelectElement).value;
                    ensureActiveProfile();
                    settings = { ...settings };
                }}>
                {#each Object.keys(settings.profiles) as name}
                    <option value={name} selected={name === settings.default_profile}>{name}</option>
                {/each}
            </select>
        </div>
        <div class="space-y-2">
            <Label>Keep versions per item (global)</Label>
            <Input
                type="number"
                min="1"
                value={settings.keep_versions_per_item}
                on:input={(e) => {
                    const val = Number((e.currentTarget as HTMLInputElement).value) || 1;
                    settings.keep_versions_per_item = Math.max(1, val);
                    settings = { ...settings };
                }} />
        </div>
    </div>

    <div class="space-y-3">
        <div class="flex items-center justify-between">
            <p class="font-medium">Path → profile mapping</p>
            <button
                type="button"
                class="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                on:click={addMapping}>
                Add mapping
            </button>
        </div>
        <div class="space-y-2">
            {#if settings.path_profiles.length === 0}
                <p class="text-sm text-muted-foreground">No mappings yet.</p>
            {:else}
                <div class="space-y-3">
                    {#each settings.path_profiles as mapping, idx}
                        <div class="grid gap-3 rounded-lg border border-border/70 p-3 md:grid-cols-[1.6fr_1fr_auto]">
                            <div class="space-y-1">
                                <Label>Path</Label>
                                <Input
                                    placeholder="/mnt/debrid/riven"
                                    value={mapping.path}
                                    on:input={(e) => {
                                        mapping.path = (e.currentTarget as HTMLInputElement).value;
                                        settings = { ...settings };
                                    }} />
                            </div>
                            <div class="space-y-1">
                                <Label>Profile</Label>
                                <select
                                    class="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                                    value={mapping.profile_name}
                                    on:change={(e) => {
                                        mapping.profile_name = (e.currentTarget as HTMLSelectElement).value;
                                        settings = { ...settings };
                                    }}>
                                    {#each Object.keys(settings.profiles) as name}
                                        <option value={name} selected={name === mapping.profile_name}>{name}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="flex items-end justify-end">
                                <button
                                    type="button"
                                    class="rounded-md border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                                    on:click={() => {
                                        settings.path_profiles = settings.path_profiles.filter((_, i) => i !== idx);
                                        settings = { ...settings };
                                    }}>
                                    Remove
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <Separator />

    <div class="space-y-3">
        <div class="flex items-center justify-between">
            <div>
                <p class="font-medium">Profiles</p>
                <p class="text-sm text-muted-foreground">Switch, edit, clone, or delete ranking profiles.</p>
            </div>
            <div class="flex items-center gap-2">
                {#each Object.keys(settings.profiles) as name}
                    <button
                        type="button"
                        class={`rounded-md border px-3 py-2 text-sm ${name === activeProfile ? "bg-primary text-primary-foreground" : "bg-card text-foreground"} hover:brightness-110`}
                        on:click={() => {
                            activeProfile = name;
                            ensureActiveProfile();
                            settings = { ...settings };
                        }}>
                        {name}
                    </button>
                    {/each}
                    {#if activeProfile !== "default"}
                    <button
                        type="button"
                        class="rounded-full border border-destructive px-2 py-1 text-destructive hover:bg-destructive/10"
                        title="Delete profile"
                        on:click={() => deleteProfile(activeProfile)}>
                        ×
                    </button>
                    {/if}
                </div>
            </div>

        {#if settings.profiles[activeProfile]}
            <div class="space-y-6 rounded-lg border border-border/70 p-4">
                <div class="grid gap-3 md:grid-cols-2">
                    <div class="space-y-1">
                        <Label>Profile name</Label>
                        <Input
                            value={settings.profiles[activeProfile].name}
                            on:input={(e) => {
                                settings.profiles[activeProfile].name = (e.currentTarget as HTMLInputElement).value;
                                settings = { ...settings };
                            }}
                            placeholder="Display name" />
                    </div>
                    <div class="space-y-1">
                        <Label>Keep versions (override)</Label>
                        <Input
                            type="number"
                            min="1"
                            value={settings.profiles[activeProfile].keep_versions_per_item ?? ""}
                            placeholder="Inherit global"
                            on:input={(e) => {
                                const val = (e.currentTarget as HTMLInputElement).value;
                                settings.profiles[activeProfile].keep_versions_per_item =
                                    val === "" ? undefined : Math.max(1, Number(val) || 1);
                                settings = { ...settings };
                            }} />
                    </div>
                </div>

                <label class="flex items-center gap-2">
                    <input
                        type="checkbox"
                        class="h-4 w-4 accent-primary"
                        checked={settings.profiles[activeProfile].enabled}
                        on:change={(e) => {
                            settings.profiles[activeProfile].enabled = (e.currentTarget as HTMLInputElement).checked;
                            settings = { ...settings };
                        }} />
                    <span class="text-sm">Profile enabled</span>
                </label>

                <div class="grid gap-4 md:grid-cols-3">
                    <div class="space-y-2">
                        <Label>Required terms (comma-separated)</Label>
                        <Input
                            value={formatCSV(settings.profiles[activeProfile].require)}
                            on:input={(e) => {
                                settings.profiles[activeProfile].require = parseCSV(
                                    (e.currentTarget as HTMLInputElement).value
                                );
                                settings = { ...settings };
                            }} />
                    </div>
                    <div class="space-y-2">
                        <Label>Excluded terms (comma-separated)</Label>
                        <Input
                            value={formatCSV(settings.profiles[activeProfile].exclude)}
                            on:input={(e) => {
                                settings.profiles[activeProfile].exclude = parseCSV(
                                    (e.currentTarget as HTMLInputElement).value
                                );
                                settings = { ...settings };
                            }} />
                    </div>
                    <div class="space-y-2">
                        <Label>Preferred terms (comma-separated)</Label>
                        <Input
                            value={formatCSV(settings.profiles[activeProfile].preferred)}
                            on:input={(e) => {
                                settings.profiles[activeProfile].preferred = parseCSV(
                                    (e.currentTarget as HTMLInputElement).value
                                );
                                settings = { ...settings };
                            }} />
                    </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <Label>Languages - required (comma-separated)</Label>
                        <Input
                            value={formatCSV(settings.profiles[activeProfile].languages.required)}
                            on:input={(e) => {
                                settings.profiles[activeProfile].languages.required = parseCSV(
                                    (e.currentTarget as HTMLInputElement).value
                                );
                                settings = { ...settings };
                            }} />
                    </div>
                    <div class="space-y-2">
                        <Label>Languages - exclude (comma-separated)</Label>
                        <Input
                            value={formatCSV(settings.profiles[activeProfile].languages.exclude)}
                            on:input={(e) => {
                                settings.profiles[activeProfile].languages.exclude = parseCSV(
                                    (e.currentTarget as HTMLInputElement).value
                                );
                                settings = { ...settings };
                            }} />
                    </div>
                    <div class="space-y-2 md:col-span-2">
                        <Label>Languages - preferred (comma-separated)</Label>
                        <Input
                            value={formatCSV(settings.profiles[activeProfile].languages.preferred)}
                            on:input={(e) => {
                                settings.profiles[activeProfile].languages.preferred = parseCSV(
                                    (e.currentTarget as HTMLInputElement).value
                                );
                                settings = { ...settings };
                            }} />
                    </div>
                </div>

                <div class="space-y-3">
                    <p class="font-medium">Resolutions</p>
                    <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {#each RESOLUTION_KEYS as key}
                            <label class="flex items-center gap-2 text-sm capitalize">
                                <input
                                    type="checkbox"
                                    class="h-4 w-4 accent-primary"
                                    checked={settings.profiles[activeProfile].resolutions[key]}
                                    on:change={(e) => {
                                        settings.profiles[activeProfile].resolutions[key] = (e.currentTarget as HTMLInputElement).checked;
                                        settings = { ...settings };
                                    }} />
                                <span>{key.replace("r", "").toUpperCase()}</span>
                            </label>
                        {/each}
                    </div>
                </div>

                <div class="space-y-3">
                    <p class="font-medium">Options</p>
                    <div class="grid gap-3 md:grid-cols-3">
                        <div class="space-y-1">
                            <Label>Title similarity</Label>
                            <Input
                                type="number"
                                step="0.1"
                                value={settings.profiles[activeProfile].options.title_similarity ?? 0}
                                on:input={(e) => {
                                    settings.profiles[activeProfile].options.title_similarity =
                                        Number((e.currentTarget as HTMLInputElement).value) || 0;
                                    settings = { ...settings };
                                }} />
                        </div>
                        <div class="space-y-1">
                            <Label>Remove ranks under</Label>
                            <Input
                                type="number"
                                value={settings.profiles[activeProfile].options.remove_ranks_under ?? 0}
                                on:input={(e) => {
                                    settings.profiles[activeProfile].options.remove_ranks_under =
                                        Number((e.currentTarget as HTMLInputElement).value) || 0;
                                    settings = { ...settings };
                                }} />
                        </div>
                    </div>
                    <div class="grid gap-2 md:grid-cols-2">
                        {#each OPTION_BOOL_KEYS as key}
                            <label class="flex items-center gap-2 text-sm capitalize">
                                <input
                                    type="checkbox"
                                    class="h-4 w-4 accent-primary"
                                    checked={settings.profiles[activeProfile].options[key]}
                                    on:change={(e) => {
                                        settings.profiles[activeProfile].options[key] = (e.currentTarget as HTMLInputElement).checked;
                                        settings = { ...settings };
                                    }} />
                                <span>{key.replace(/_/g, " ")}</span>
                            </label>
                        {/each}
                    </div>
                </div>

                <div class="space-y-4">
                    <p class="font-medium">Custom ranks</p>
                    <div class="space-y-3">
                        {#each Object.entries(CUSTOM_SECTIONS) as [section, keys]}
                            <div class="space-y-2 rounded-md border border-border/60 p-3">
                                <p class="text-sm font-semibold capitalize">{section}</p>
                                <div class="grid gap-3 md:grid-cols-2">
                                    {#each keys as key}
                                        <div class="space-y-1 rounded border border-border/50 p-2">
                                            <div class="flex items-center justify-between">
                                                <span class="text-xs font-medium uppercase">{key}</span>
                                                <input
                                                    type="checkbox"
                                                    class="h-4 w-4 accent-primary"
                                                    checked={Boolean(settings.profiles[activeProfile].custom_ranks?.[section]?.[key]?.use_custom_rank)}
                                                    on:change={(event) =>
                                                        updateCustomRank(
                                                            section as keyof CustomRanksConfig,
                                                            key,
                                                            "use_custom_rank",
                                                            (event.currentTarget as HTMLInputElement).checked
                                                        )
                                                    } />
                                            </div>
                                            <div class="flex items-center gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    class="h-4 w-4 accent-primary"
                                                    checked={Boolean(settings.profiles[activeProfile].custom_ranks?.[section]?.[key]?.fetch)}
                                                    on:change={(event) =>
                                                        updateCustomRank(
                                                            section as keyof CustomRanksConfig,
                                                            key,
                                                            "fetch",
                                                            (event.currentTarget as HTMLInputElement).checked
                                                        )
                                                    } />
                                                <span>Fetch</span>
                                            </div>
                                            <Input
                                                type="number"
                                                class="mt-2 h-8 text-xs"
                                                value={settings.profiles[activeProfile].custom_ranks?.[section]?.[key]?.rank ?? ""}
                                                placeholder="rank"
                                                on:input={(e) =>
                                                    updateCustomRank(
                                                        section as keyof CustomRanksConfig,
                                                        key,
                                                        "rank",
                                                        (e.currentTarget as HTMLInputElement).value === ""
                                                            ? undefined
                                                            : Number((e.currentTarget as HTMLInputElement).value) || 0
                                                    )
                                                } />
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
