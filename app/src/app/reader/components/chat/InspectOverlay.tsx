'use client';

import React, { useState } from 'react';
import { FiX, FiEye, FiEyeOff, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import type { AgentMessage } from '@mariozechner/pi-agent-core';

interface InspectOverlayProps {
  provider: string;
  modelId: string;
  apiKey: string | undefined;
  systemPrompt: string;
  messages: AgentMessage[];
  pendingUserMessage: string;
  onClose: () => void;
}

function maskKey(key: string): string {
  if (key.length <= 12) return '\u2022'.repeat(key.length);
  return key.slice(0, 8) + '\u2022'.repeat(8) + key.slice(-4);
}

function Section({
  title,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-base-300 rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium bg-base-200/50 hover:bg-base-200 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        {open ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
        {title}
        {badge && (
          <span className="badge badge-sm badge-ghost ml-auto">{badge}</span>
        )}
      </button>
      {open && <div className="p-3 border-t border-base-300">{children}</div>}
    </div>
  );
}

function messageContentToString(msg: AgentMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block.type === 'text') return (block as { type: 'text'; text: string }).text;
        return `[${block.type}]`;
      })
      .join('');
  }
  return JSON.stringify(msg.content, null, 2);
}

const InspectOverlay: React.FC<InspectOverlayProps> = ({
  provider,
  modelId,
  apiKey,
  systemPrompt,
  messages,
  pendingUserMessage,
  onClose,
}) => {
  const [showKey, setShowKey] = useState(false);

  return (
    <>
      {/* Backdrop — click to dismiss */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="bg-base-100 rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
          <h3 className="text-sm font-semibold">Inspect Context</h3>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={onClose}
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Provider / Model / Key */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <span className="text-base-content/50">Provider</span>
            <span className="font-mono">{provider}</span>
            <span className="text-base-content/50">Model</span>
            <span className="font-mono">{modelId}</span>
            <span className="text-base-content/50">API Key</span>
            <span className="flex items-center gap-2">
              <code className="font-mono text-xs bg-base-200 px-1.5 py-0.5 rounded">
                {apiKey ? (showKey ? apiKey : maskKey(apiKey)) : '(none)'}
              </code>
              {apiKey && (
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? 'Hide' : 'Show'}
                >
                  {showKey ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                </button>
              )}
            </span>
          </div>

          {/* System Prompt */}
          <Section title="System Prompt" defaultOpen={false}>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto bg-base-200/50 rounded p-2">
              {systemPrompt || '(empty)'}
            </pre>
          </Section>

          {/* Messages */}
          <Section
            title="Messages"
            defaultOpen={true}
            badge={String(messages.length)}
          >
            {messages.length === 0 ? (
              <p className="text-xs text-base-content/50">(no messages yet)</p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {messages.map((msg, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-semibold text-base-content/70">
                      [{msg.role}]
                    </span>
                    <pre className="font-mono whitespace-pre-wrap break-words mt-0.5 bg-base-200/50 rounded p-2">
                      {messageContentToString(msg)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Pending user message */}
          <Section title="Next User Message (preview)" defaultOpen={true}>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-[30vh] overflow-y-auto bg-base-200/50 rounded p-2">
              {pendingUserMessage || '(empty — type something or select text)'}
            </pre>
          </Section>
        </div>
      </div>
      </div>
    </>
  );
};

export default InspectOverlay;
