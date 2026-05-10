import { test, expect } from '@playwright/test';

test('app loads and renders the UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app__title')).toHaveText('Browser Agent Mesh');
});

test('prompt input is visible and functional', async ({ page }) => {
  await page.goto('/');
  const textarea = page.locator('.rich-prompt-input__textarea');
  await expect(textarea).toBeVisible();
  await textarea.fill('test prompt');
  await expect(textarea).toHaveValue('test prompt');
});

test('prompt input highlights keywords with rainbow effect', async ({ page }) => {
  await page.goto('/');
  const textarea = page.locator('.rich-prompt-input__textarea');
  await textarea.fill('research this topic');

  const overlay = page.locator('.rich-prompt-input__overlay');
  await expect(overlay).toBeVisible();

  const keyword = overlay.locator('.rainbow-keyword');
  await expect(keyword).toHaveText('research');
});

test('mesh graph shows empty state initially', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.mesh-graph__empty')).toBeVisible();
});

test('prompt input shows processing status after submit', async ({ page }) => {
  await page.goto('/');
  await page.locator('.rich-prompt-input__textarea').fill('what is a llm?');
  await page.locator('.prompt-input__submit').click();

  await expect(page.locator('.prompt-input__status')).toContainText(/Queued prompt:|Routing prompt:|Processing response:/);
});

test('workflow card renders model and response from blackboard result', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(async () => {
    const { createWorkflow } = await import('/src/core/blackboard/root-doc.ts');

    const meshWindow = window as typeof window & {
      __MESH_DOC__?: {
        transact: (fn: () => void) => void;
      };
    };

    const doc = meshWindow.__MESH_DOC__;
    if (!doc) {
      throw new Error('Shared mesh doc not available');
    }

    const workflow = createWorkflow(doc as never, 'workflow-ui-test', 'ui-main-thread', 'what is a llm?');

    doc.transact(() => {
      workflow.set('taskCount', 1);
      workflow.set('completedCount', 1);
      workflow.set('state', 'completed');
      workflow.set('updatedAt', Date.now());
      workflow.set('completedAt', Date.now());
      workflow.set('result', {
        type: 'synthesis_result',
        content: 'Fallback synthesis text',
        fragments: [
          {
            taskId: 'task-1',
            content: {
              type: 'llm_result',
              prompt: 'what is a llm?',
              output: 'A large language model is a text model trained to predict and generate language.',
              modelId: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
              tokensGenerated: 361,
              tokensPerSec: 18,
            },
            confidence: 1,
          },
        ],
        metadata: {
          totalCompletedTasks: 1,
          deduplicatedCount: 1,
          fragmentCount: 1,
          confidenceThreshold: 0.5,
        },
      });
    });
  });

  await expect(page.locator('.workflow-view').first()).toContainText('Model: Llama-3.2-3B-Instruct-q4f32_1-MLC');
  await expect(page.locator('.workflow-view__response').first()).toContainText(
    'A large language model is a text model trained to predict and generate language.',
  );
});
