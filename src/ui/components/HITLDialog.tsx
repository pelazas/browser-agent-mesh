import React, { useState } from 'react';
import { useHITLDialog } from '@ui/hooks/useHITLDialog';

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const DIALOG_STYLE: React.CSSProperties = {
  backgroundColor: '#1a1a2e',
  border: '1px solid #4a4a6a',
  borderRadius: 12,
  padding: 24,
  maxWidth: 520,
  width: '90%',
  color: '#e0e0e0',
  fontFamily: 'system-ui, sans-serif',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

const HEADER_STYLE: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginBottom: 12,
  color: '#ffa726',
};

const MESSAGE_STYLE: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.5,
  marginBottom: 20,
  whiteSpace: 'pre-wrap',
};

const BUTTON_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
};

const BUTTON_BASE: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};

export default function HITLDialog(): React.ReactElement | null {
  const { state, approve, reject } = useHITLDialog();
  const [modifyText, setModifyText] = useState('');
  const [showModify, setShowModify] = useState(false);

  if (!state.show || !state.request) return null;

  const { request } = state;

  return (
    <div style={OVERLAY_STYLE} onClick={(e) => { if (e.target === e.currentTarget) reject(); }}>
      <div style={DIALOG_STYLE}>
        <div style={HEADER_STYLE}>Human Approval Required</div>

        <div style={MESSAGE_STYLE}>{request.message}</div>

        {request.options.includes('modify') && showModify && (
          <textarea
            value={modifyText}
            onChange={(e) => setModifyText(e.target.value)}
            style={{
              width: '100%',
              minHeight: 80,
              padding: 8,
              borderRadius: 6,
              border: '1px solid #4a4a6a',
              backgroundColor: '#16213e',
              color: '#e0e0e0',
              fontSize: 13,
              marginBottom: 12,
              resize: 'vertical',
              fontFamily: 'monospace',
            }}
            placeholder="Enter modified content..."
          />
        )}

        <div style={BUTTON_ROW_STYLE}>
          {request.options.includes('approve') && !showModify && (
            <button style={{ ...BUTTON_BASE, backgroundColor: '#2e7d32', color: '#fff' }} onClick={approve}>
              Approve
            </button>
          )}
          {request.options.includes('modify') && !showModify && (
            <button style={{ ...BUTTON_BASE, backgroundColor: '#1565c0', color: '#fff' }} onClick={() => setShowModify(true)}>
              Modify
            </button>
          )}
          {showModify && (
            <button
              style={{ ...BUTTON_BASE, backgroundColor: '#1565c0', color: '#fff' }}
              onClick={() => {
                const resp = state.respond;
                if (resp && modifyText.trim()) {
                  resp({ action: 'modify', modifiedContent: modifyText });
                  setShowModify(false);
                }
              }}
            >
              Submit
            </button>
          )}
          {request.options.includes('reject') && (
            <button style={{ ...BUTTON_BASE, backgroundColor: '#c62828', color: '#fff' }} onClick={reject}>
              Reject
            </button>
          )}
        </div>

        <div style={{ fontSize: 11, color: '#888', marginTop: 12, textAlign: 'right' }}>
          Auto-approves in {Math.ceil(request.timeoutMs / 1000)}s
        </div>
      </div>
    </div>
  );
}
