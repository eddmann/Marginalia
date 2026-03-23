'use client';

import React from 'react';
import { useChatStore } from '@/store/chatStore';
import { useApiKeyStore } from '@/store/apiKeyStore';

const MODELS = [
  { provider: 'anthropic', id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { provider: 'anthropic', id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { provider: 'openai-codex', id: 'gpt-5.4', label: 'GPT-5.4' },
];

const ModelSelector: React.FC = () => {
  const { provider, modelId, setModel } = useChatStore();
  const { getConfiguredProviders } = useApiKeyStore();
  const configured = getConfiguredProviders();

  const available = MODELS.filter((m) => configured.includes(m.provider));

  if (available.length === 0) {
    const current = MODELS.find((m) => m.provider === provider && m.id === modelId);
    return (
      <span className='text-xs text-base-content/50 px-1'>
        {current?.label || modelId} (no auth)
      </span>
    );
  }

  return (
    <select
      className='select select-ghost select-xs text-xs max-w-[200px]'
      value={`${provider}:${modelId}`}
      onChange={(e) => {
        const [p, ...rest] = e.target.value.split(':');
        const m = rest.join(':');
        if (p && m) setModel(p, m);
      }}
    >
      {available.map((m) => (
        <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
          {m.label}
        </option>
      ))}
    </select>
  );
};

export default ModelSelector;
