import React from 'react';
import { KeywordText } from './KeywordText';
import { useRichPromptInput } from './useRichPromptInput';

interface RichPromptInputProps {
  disabled?: boolean;
}

export const RichPromptInput: React.FC<RichPromptInputProps> = ({ disabled }) => {
  const {
    value,
    textareaRef,
    overlayRef,
    handleChange,
    handleScroll,
    handleSubmit,
  } = useRichPromptInput(disabled);

  return (
    <form className="prompt-input" onSubmit={handleSubmit}>
      <div className="rich-prompt-input__container">
        <div
          ref={overlayRef}
          className="rich-prompt-input__overlay"
          aria-hidden="true"
        >
          <KeywordText text={value} />
        </div>
        <textarea
          ref={textareaRef}
          className="rich-prompt-input__textarea"
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          placeholder="Enter a prompt for the agent mesh..."
          disabled={disabled}
          rows={1}
        />
      </div>
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
