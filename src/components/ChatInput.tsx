import { useState, FormEvent } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
    onSend: (message: string) => void;
    isLoading: boolean;
    placeholder?: string;
}

export default function ChatInput({ onSend, isLoading, placeholder }: ChatInputProps) {
    const [input, setInput] = useState("");

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        onSend(input);
        setInput("");
    };

    return (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-slate-950/80 backdrop-blur-sm border-t border-slate-800">
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={placeholder || "Décrivez le workflow que vous souhaitez créer ou modifier..."}
                    className="w-full bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl pr-12 py-4 shadow-lg focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
}
