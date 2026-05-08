import React, { useCallback, useState } from 'react';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({ onSubmit, disabled }) => {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && !disabled) {
        onSubmit(trimmed);
        setValue('');
      }
    },
    [value, disabled, onSubmit],
  );

  return (
    <form className="prompt-input" onSubmit={handleSubmit}>
      <textarea
        className="prompt-input__textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter a prompt for the agent mesh..."
        disabled={disabled}
        rows={3}
      />
      <button
        className="prompt-input__submit"
        type="submit"
        disabled={disabled || !value.trim()}
      >
        Send
      </button>
    </form>
  );
};
