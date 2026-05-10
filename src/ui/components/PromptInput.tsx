import React from 'react';
import { usePromptInput } from '@ui/components/usePromptInput';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  active?: boolean;
  statusMessage?: string | null;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  onSubmit,
  disabled,
  active = false,
  statusMessage = null,
}) => {
  const { value, submitDisabled, handleChange, handleSubmit } = usePromptInput({ onSubmit, disabled });

  return (
    <form className="prompt-input" onSubmit={handleSubmit}>
      <textarea
        className="prompt-input__textarea"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter a prompt for the agent mesh..."
        disabled={disabled}
        rows={3}
      />
      <button
        className={`prompt-input__submit${active ? ' prompt-input__submit--active' : ''}`}
        type="submit"
        disabled={submitDisabled}
      >
        Send
      </button>
      {statusMessage && (
        <div className={`prompt-input__status${active ? ' prompt-input__status--active' : ''}`}>
          <span className="prompt-input__status-dot" />
          <span>{statusMessage}</span>
        </div>
      )}
    </form>
  );
};
