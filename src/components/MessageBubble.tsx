import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Bot, User, Check, Copy } from "lucide-react";

function classNames(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(" ");
}

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
}

const CodeBlock = ({ inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!inline && match) {
        return (
            <div className="relative group rounded-md overflow-hidden my-4">
                <div className="flex items-center justify-between bg-zinc-700 px-4 py-2 text-xs text-zinc-200">
                    <span className="font-mono">{match[1]}</span>
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                        {copied ? (
                            <>
                                <Check size={14} className="text-green-400" /> Copié
                            </>
                        ) : (
                            <>
                                <Copy size={14} /> Copier
                            </>
                        )}
                    </button>
                </div>
                <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{ margin: 0, borderRadius: "0 0 0.375rem 0.375rem" }}
                    {...props}
                >
                    {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
            </div>
        );
    }

    return (
        <code className={classNames("bg-slate-800 rounded px-1 py-0.5", className)} {...props}>
            {children}
        </code>
    );
};

const MessageBubble = memo(({ message }: { message: Message }) => {
    return (
        <div
            className={classNames(
                "flex gap-4 p-4 rounded-lg max-w-3xl",
                message.role === "assistant" ? "bg-slate-900 mx-auto" : "bg-slate-800 ml-auto"
            )}
        >
            <div className="flex-shrink-0 mt-1">
                {message.role === "assistant" ? (
                    <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                        <Bot size={20} className="text-white" />
                    </div>
                ) : (
                    <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center">
                        <User size={20} className="text-white" />
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0 prose prose-invert max-w-none">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        code: CodeBlock,
                    }}
                >
                    {message.content}
                </ReactMarkdown>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison function for performance
    // Only re-render if content or id changes
    return prevProps.message.content === nextProps.message.content && prevProps.message.id === nextProps.message.id;
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
