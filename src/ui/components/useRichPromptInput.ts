import { useCallback, useEffect, useRef, useState } from 'react';
import { createPromptRequest } from '@core/blackboard/root-doc';
import { useBlackboardContext } from '@ui/context/BlackboardContext';

export interface UseRichPromptInputResult {
  value: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  overlayRef: React.RefObject<HTMLDivElement>;
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleScroll: () => void;
  handleSubmit: (e: React.FormEvent) => void;
}

export function useRichPromptInput(disabled?: boolean): UseRichPromptInputResult {
  const { doc } = useBlackboardContext();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const requesterNodeIdRef = useRef('ui-main-thread');

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const overlay = overlayRef.current;
    if (textarea && overlay) {
      overlay.scrollTop = textarea.scrollTop;
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && !disabled && doc) {
        createPromptRequest(doc, trimmed, requesterNodeIdRef.current);
        setValue('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    },
    [value, disabled, doc],
  );

  return {
    value,
    textareaRef,
    overlayRef,
    handleChange,
    handleScroll,
    handleSubmit,
  };
}
