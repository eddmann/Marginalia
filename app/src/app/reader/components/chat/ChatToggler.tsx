'use client';

import React from 'react';
import { LuMessageSquareText } from 'react-icons/lu';

import { useChatStore } from '@/store/chatStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import Button from '@/components/Button';

const ChatToggler: React.FC = () => {
  const _ = useTranslation();
  const { isOpen, togglePanel } = useChatStore();
  const iconSize16 = useResponsiveSize(16);

  return (
    <Button
      icon={
        <LuMessageSquareText
          size={iconSize16}
          className={isOpen ? 'text-primary' : 'text-base-content'}
        />
      }
      onClick={togglePanel}
      label={_('AI Chat')}
    />
  );
};

export default ChatToggler;
