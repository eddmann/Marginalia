'use client';

import React, { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FiSend, FiX, FiTrash2, FiPlus, FiCode, FiSearch, FiGlobe } from 'react-icons/fi';
import { BsPin, BsPinFill } from 'react-icons/bs';
import clsx from 'clsx';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { useChatStore } from '@/store/chatStore';
import { useApiKeyStore } from '@/store/apiKeyStore';
import { useSidebarStore } from '@/store/sidebarStore';

import { createReadingAgent, buildSystemPrompt, buildUserMessageWithContext, chatMessagesToAgentMessages, webSearchTool } from '@/services/pi/agent';
import {
  saveMessages,
  loadMessages,
  saveConversationIndex,
  loadConversationIndex,
  deleteConversation,
  type ChatMessage,
  type ConversationMeta,
} from '@/services/pi/chatPersistence';
import type { Agent } from '@mariozechner/pi-agent-core';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import ModelSelector from './ModelSelector';
import InspectOverlay from './InspectOverlay';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

const ChatPanel: React.FC = () => {
  const {
    isOpen, isPinned, panelWidth,
    pendingContext, currentChapter,
    bookTitle, bookAuthor, bookHash, currentChapterText,
    conversationId,
    provider, modelId, webSearchEnabled,
    setOpen, setPinned, setPanelWidth, setPendingContext,
    setConversationId, setWebSearchEnabled,
  } = useChatStore();

  const isResizing = useRef(false);

  const handleResizeStart = (e: ReactPointerEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMove = (ev: globalThis.PointerEvent) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.max(280, Math.min(800, startWidth + delta));
      setPanelWidth(newWidth);
    };

    const onUp = () => {
      isResizing.current = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const { getKey, loadExternalTokens } = useApiKeyStore();
  const { sideBarBookKey } = useSidebarStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showInspect, setShowInspect] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const agentRef = useRef<Agent | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentBookHash = useRef<string>('');

  // Auto-load Claude Code OAuth token on mount
  useEffect(() => {
    loadExternalTokens();
  }, [loadExternalTokens]);

  // Set book hash from sidebar book key
  useEffect(() => {
    if (sideBarBookKey) {
      const hash = sideBarBookKey.split('-')[0] || '';
      if (hash && hash !== currentBookHash.current) {
        currentBookHash.current = hash;
        useChatStore.getState().setBookHash(hash);
        // Load conversations for this book
        loadConversationIndex(hash).then((convos) => {
          setConversations(convos);
          if (convos.length > 0) {
            // Resume latest conversation
            const latest = convos.sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0]!;
            setConversationId(latest.id);
            loadMessages(hash, latest.id).then((loaded) => {
              setMessages(loaded);
              if (loaded.length > 0) {
                const agent = getOrCreateAgent();
                agent.replaceMessages(chatMessagesToAgentMessages(loaded, provider, modelId));
              }
            });
          } else {
            // Start fresh
            const newId = generateId();
            setConversationId(newId);
            setMessages([]);
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideBarBookKey, setConversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Save messages after each update (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (messages.length === 0 || !bookHash || !conversationId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveMessages(bookHash, conversationId, messages).catch(() => {});
      // Update conversation index
      const name = messages[0]?.content.substring(0, 50) || 'New conversation';
      const meta: ConversationMeta = {
        id: conversationId,
        name,
        createdAt: messages[0]?.timestamp || Date.now(),
        lastMessageAt: messages[messages.length - 1]?.timestamp || Date.now(),
        messageCount: messages.length,
      };
      const updated = conversations.filter((c) => c.id !== conversationId);
      updated.push(meta);
      setConversations(updated);
      saveConversationIndex(bookHash, updated).catch(() => {});
    }, 500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, bookHash, conversationId]);

  // Create/recreate agent when provider/model changes
  const getOrCreateAgent = useCallback(() => {
    if (!agentRef.current || agentRef.current.state?.model?.id !== modelId) {
      agentRef.current = createReadingAgent({
        provider,
        modelId,
        getApiKey: (p: string) => getKey(p),
      });
    }
    return agentRef.current;
  }, [provider, modelId, getKey]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !pendingContext) return;
    if (isStreaming) return;

    const apiKey = getKey(provider);
    if (!apiKey) {
      setError(`No auth token found for ${provider}. Make sure Claude Code or Codex CLI is logged in.`);
      return;
    }

    const agent = getOrCreateAgent();

    agent.setSystemPrompt(buildSystemPrompt({
      bookTitle,
      bookAuthor,
      chapterTitle: currentChapter,
      chapterText: currentChapterText,
      webSearchEnabled,
    }));
    agent.setTools(webSearchEnabled ? [webSearchTool] : []);

    // Build full context message for the AI (includes surrounding text, chapter refs)
    const aiContent = buildUserMessageWithContext(
      text,
      pendingContext ? {
        selectedText: pendingContext.selectedText,
        surroundingText: pendingContext.surroundingText,
        chapterTitle: pendingContext.chapterTitle,
      } : null,
    );

    // Store user message with selection metadata for nice UI rendering
    const userMsg: ChatMessage = {
      role: 'user',
      content: text || 'What does this mean?',
      timestamp: Date.now(),
      ...(pendingContext ? {
        selection: {
          text: pendingContext.selectedText,
          chapter: pendingContext.chapterTitle,
        },
      } : {}),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setPendingContext(null);
    setIsStreaming(true);
    setStreamingContent('');
    setError(null);

    let accumulatedText = '';

    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      if (event.type === 'message_update') {
        const ame = event.assistantMessageEvent;
        if (ame.type === 'text_delta') {
          const delta = (ame as { type: 'text_delta'; delta: string }).delta;
          accumulatedText += delta;
          setStreamingContent(accumulatedText);
        }
      }
      if (event.type === 'message_end') {
        const msg = event.message;
        if (msg.role === 'assistant') {
          let textContent = accumulatedText;
          if (!textContent) {
            textContent = msg.content
              .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
              .map((c) => c.text)
              .join('');
          }
          // Skip tool-call-only messages (no text) — the real response comes after tool execution
          if (!textContent) {
            accumulatedText = '';
            return;
          }
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: textContent,
            timestamp: Date.now(),
          }]);
          setStreamingContent('');
          setIsStreaming(false);
        }
      }
      if (event.type === 'tool_execution_start') {
        setActiveTool(event.toolName);
      }
      if (event.type === 'tool_execution_end') {
        setActiveTool(null);
      }
      if (event.type === 'agent_end') {
        setStreamingContent('');
        setIsStreaming(false);
        setActiveTool(null);
      }
    });

    try {
      await agent.prompt(aiContent);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      setError(errMsg);
      setIsStreaming(false);
      setStreamingContent('');
    } finally {
      unsubscribe();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleNewConversation = () => {
    const newId = generateId();
    setConversationId(newId);
    setMessages([]);
    setStreamingContent('');
    setError(null);
    if (agentRef.current) {
      agentRef.current.replaceMessages([]);
    }
  };

  const handleDeleteConversation = async () => {
    // Delete from disk
    if (bookHash && conversationId) {
      await deleteConversation(bookHash, conversationId);
      const updated = conversations.filter((c) => c.id !== conversationId);
      setConversations(updated);
      await saveConversationIndex(bookHash, updated).catch(() => {});
    }
    // Start fresh
    const newId = generateId();
    setConversationId(newId);
    setMessages([]);
    setStreamingContent('');
    setError(null);
    if (agentRef.current) {
      agentRef.current.replaceMessages([]);
    }
  };

  const handleAbort = () => {
    agentRef.current?.abort();
    setIsStreaming(false);
  };

  const handleSwitchConversation = async (id: string) => {
    if (id === conversationId) return;
    setConversationId(id);
    const loaded = await loadMessages(bookHash, id);
    setMessages(loaded);
    setStreamingContent('');
    setError(null);
    const agent = getOrCreateAgent();
    agent.replaceMessages(loaded.length > 0 ? chatMessagesToAgentMessages(loaded, provider, modelId) : []);
  };

  const renderMarkdown = (content: string) => {
    const html = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(html);
  };

  if (!isOpen) return null;

  return (
    <div
      className={clsx(
        'chat-panel flex flex-col border-l border-base-300 bg-base-100',
        isPinned ? 'relative' : 'fixed right-0 top-0 bottom-0 z-[45] shadow-xl',
      )}
      style={{ width: panelWidth, minWidth: 280, maxWidth: 800 }}
    >
      {/* Resize handle */}
      <div
        className='absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 z-10'
        onPointerDown={handleResizeStart}
      />
      {/* Header */}
      <div className='flex items-center gap-1 border-b border-base-300 px-3 py-2'>
        <ModelSelector />
        <div className='flex-1' />
        <button
          className='btn btn-ghost btn-xs btn-square'
          onClick={() => setShowInspect(true)}
          title='Inspect LLM context'
        >
          <FiCode size={14} />
        </button>
        <button
          className='btn btn-ghost btn-xs btn-square'
          onClick={handleNewConversation}
          title='New conversation'
        >
          <FiPlus size={14} />
        </button>
        <button
          className='btn btn-ghost btn-xs btn-square'
          onClick={handleDeleteConversation}
          title='Delete conversation'
        >
          <FiTrash2 size={14} />
        </button>
        <button
          className='btn btn-ghost btn-xs btn-square'
          onClick={() => setPinned(!isPinned)}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          {isPinned ? <BsPinFill size={14} /> : <BsPin size={14} />}
        </button>
        <button
          className='btn btn-ghost btn-xs btn-square'
          onClick={() => setOpen(false)}
          title='Close'
        >
          <FiX size={14} />
        </button>
      </div>

      {/* Chapter context + conversation switcher */}
      <div className='border-b border-base-300 px-3 py-1 flex items-center gap-2'>
        {currentChapter && (
          <span className='text-xs text-base-content/50 truncate flex-1'>
            {currentChapter}
          </span>
        )}
        {conversations.length > 1 && (
          <select
            className='select select-ghost select-xs text-xs max-w-[120px]'
            value={conversationId}
            onChange={(e) => handleSwitchConversation(e.target.value)}
          >
            {conversations
              .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.substring(0, 30)}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* Messages */}
      <div className='flex-1 overflow-y-auto px-3 py-2 space-y-3 select-text'>
        {messages.length === 0 && !streamingContent && (
          <div className='flex items-center justify-center h-full text-base-content/30 text-sm'>
            Select text and send to chat, or ask a question
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={clsx('chat', msg.role === 'user' ? 'chat-end' : 'chat-start')}>
            <div
              className={clsx(
                'chat-bubble text-sm',
                msg.role === 'user' ? 'chat-bubble-primary' : 'chat-bubble bg-base-200 text-base-content',
              )}
            >
              {msg.role === 'user' ? (
                <div>
                  {msg.selection && (
                    <div className='border-l-2 border-white/40 pl-2 mb-2 text-xs opacity-80 italic line-clamp-3'>
                      &ldquo;{msg.selection.text}&rdquo;
                      {msg.selection.chapter && (
                        <div className='text-[10px] opacity-60 mt-0.5 not-italic'>
                          {msg.selection.chapter}
                        </div>
                      )}
                    </div>
                  )}
                  <span className='whitespace-pre-wrap'>{msg.content}</span>
                </div>
              ) : (
                <div
                  className='prose prose-sm max-w-none'
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              )}
            </div>
          </div>
        ))}
        {streamingContent && (
          <div className='chat chat-start'>
            <div className='chat-bubble bg-base-200 text-base-content text-sm'>
              <div
                className='prose prose-sm max-w-none'
                dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
              />
            </div>
          </div>
        )}
        {isStreaming && !streamingContent && !activeTool && (
          <div className='chat chat-start'>
            <div className='chat-bubble bg-base-200 text-base-content text-sm'>
              <span className='loading loading-dots loading-xs' />
            </div>
          </div>
        )}
        {activeTool && (
          <div className='flex items-center gap-2 text-xs text-base-content/50 px-1 py-1'>
            <FiSearch size={12} className='animate-pulse' />
            <span>Searching the web&hellip;</span>
          </div>
        )}
        {error && (
          <div className='alert alert-error text-xs'>
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending context preview */}
      {pendingContext && (
        <div className='border-t border-base-300 px-3 py-2 bg-base-200/50'>
          <div className='flex items-start gap-2'>
            <div className='flex-1 text-xs text-base-content/70 line-clamp-3 italic'>
              &ldquo;{pendingContext.selectedText}&rdquo;
            </div>
            <button
              className='btn btn-ghost btn-xs btn-square shrink-0'
              onClick={() => setPendingContext(null)}
            >
              <FiX size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className='border-t border-base-300 px-3 py-2'>
        <div className='flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-2 py-2 focus-within:border-primary'>
          <button
            className={clsx(
              'btn btn-xs btn-circle shrink-0',
              webSearchEnabled ? 'bg-primary/20 text-primary hover:bg-primary/30 border-0' : 'btn-ghost text-base-content/40',
            )}
            onClick={() => setWebSearchEnabled(!webSearchEnabled)}
            title={webSearchEnabled ? 'Disable web search' : 'Enable web search'}
          >
            <FiGlobe size={13} />
          </button>
          <textarea
            ref={inputRef}
            className='flex-1 resize-none bg-transparent text-sm outline-none min-h-[20px] max-h-[120px] placeholder:text-base-content/40'
            placeholder={pendingContext ? 'Ask about this selection...' : 'Ask about the book...'}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className='btn btn-xs btn-circle btn-error' onClick={handleAbort} title='Stop'>
              <FiX size={12} />
            </button>
          ) : (
            <button
              className='btn btn-xs btn-circle btn-primary'
              onClick={handleSend}
              disabled={!input.trim() && !pendingContext}
              title='Send'
            >
              <FiSend size={12} />
            </button>
          )}
        </div>
      </div>

      {showInspect && (
        <InspectOverlay
          provider={provider}
          modelId={modelId}
          apiKey={getKey(provider)}
          systemPrompt={buildSystemPrompt({
            bookTitle,
            bookAuthor,
            chapterTitle: currentChapter,
            chapterText: currentChapterText,
            webSearchEnabled,
          })}
          messages={agentRef.current?.state?.messages ?? []}
          pendingUserMessage={buildUserMessageWithContext(
            input,
            pendingContext ? {
              selectedText: pendingContext.selectedText,
              surroundingText: pendingContext.surroundingText,
              chapterTitle: pendingContext.chapterTitle,
            } : null,
          )}
          onClose={() => setShowInspect(false)}
        />
      )}
    </div>
  );
};

export default ChatPanel;
