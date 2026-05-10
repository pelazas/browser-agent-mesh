import { useCallback, useState, type FormEvent } from 'react';

interface UsePromptInputArgs {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
}

interface UsePromptInputReturn {
  value: string;
  submitDisabled: boolean;
  handleChange: (value: string) => void;
  handleSubmit: (event: FormEvent) => void;
}

export function usePromptInput({ onSubmit, disabled }: UsePromptInputArgs): UsePromptInputReturn {
  const [value, setValue] = useState('');

  const handleChange = useCallback((nextValue: string) => {
    setValue(nextValue);
  }, []);

  const handleSubmit = useCallback((event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }

    onSubmit(trimmed);
    setValue('');
  }, [value, disabled, onSubmit]);

  return {
    value,
    submitDisabled: !!disabled || value.trim().length === 0,
    handleChange,
    handleSubmit,
  };
}
