"use client";

import { useEffect, useState } from "react";
import { Save, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ConfigItem {
    key: string;
    value: string;
    isSecret: boolean;
}

const DEFAULT_KEYS = [
    { key: "N8N_API_URL", label: "n8n API URL", placeholder: "http://host.docker.internal:5678" },
    { key: "N8N_API_KEY", label: "n8n API Key", placeholder: "your-n8n-api-key", secret: true },
    { key: "AI_BASE_URL", label: "AI Base URL", placeholder: "https://openrouter.ai/api/v1" },
    { key: "AI_API_KEY", label: "AI API Key", placeholder: "sk-or-...", secret: true },
    { key: "AI_MODEL", label: "AI Model", placeholder: "anthropic/claude-3-sonnet" },
];

export default function SettingsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [configs, setConfigs] = useState<Record<string, string>>({});
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

    useEffect(() => {
        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                setConfigs(data);
                setLoading(false);
            });
    }, []);

    const handleChange = (key: string, value: string) => {
        setConfigs((prev) => ({ ...prev, [key]: value }));
    };

    const toggleSecret = (key: string) => {
        setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(configs),
            });
            alert("Settings saved successfully!");
            router.refresh();
        } catch (error) {
            alert("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-8">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                        <ArrowLeft />
                    </Link>
                    <h1 className="text-2xl font-bold">Configuration</h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-6">

                        {DEFAULT_KEYS.map((field) => (
                            <div key={field.key} className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">
                                    {field.label}
                                </label>
                                <div className="relative">
                                    <input
                                        type={field.secret && !showSecrets[field.key] ? "password" : "text"}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-slate-700"
                                        placeholder={field.placeholder}
                                        value={configs[field.key] || ""}
                                        onChange={(e) => handleChange(field.key, e.target.value)}
                                    />
                                    {field.secret && (
                                        <button
                                            type="button"
                                            onClick={() => toggleSecret(field.key)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                        >
                                            {showSecrets[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
