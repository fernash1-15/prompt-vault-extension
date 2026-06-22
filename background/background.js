// Background service worker for Prompt Vault

chrome.runtime.onInstalled.addListener(() => {
  // Seed default data on first install
  chrome.storage.local.get(['promptVaultData'], (result) => {
    if (!result.promptVaultData) {
      const defaultData = {
        folders: [
          { id: 'f1', name: 'Writing', color: '#6366f1', icon: '✍️' },
          { id: 'f2', name: 'Coding', color: '#10b981', icon: '💻' },
          { id: 'f3', name: 'Marketing', color: '#f59e0b', icon: '📣' },
          { id: 'f4', name: 'Research', color: '#3b82f6', icon: '🔍' }
        ],
        prompts: [
          {
            id: 'p1',
            title: 'Explain like I\'m 5',
            body: 'Explain the following concept in simple terms, as if you were talking to a 5-year-old with no prior knowledge:\n\n[CONCEPT]',
            folderId: 'f4',
            tags: ['explain', 'simplify'],
            createdAt: Date.now(),
            usageCount: 0
          },
          {
            id: 'p2',
            title: 'Fix my code',
            body: 'Review the following code, identify any bugs or issues, and provide a corrected version with explanations:\n\n```\n[CODE]\n```',
            folderId: 'f2',
            tags: ['debug', 'review'],
            createdAt: Date.now(),
            usageCount: 0
          },
          {
            id: 'p3',
            title: 'Write a cold email',
            body: 'Write a concise, compelling cold outreach email for the following context:\n\nProduct/Service: [PRODUCT]\nTarget audience: [AUDIENCE]\nKey benefit: [BENEFIT]\nCall to action: [CTA]',
            folderId: 'f3',
            tags: ['email', 'sales'],
            createdAt: Date.now(),
            usageCount: 0
          },
          {
            id: 'p4',
            title: 'Improve my writing',
            body: 'Rewrite the following text to improve clarity, flow, and impact while preserving the original meaning and tone:\n\n[TEXT]',
            folderId: 'f1',
            tags: ['edit', 'refine'],
            createdAt: Date.now(),
            usageCount: 0
          }
        ]
      };
      chrome.storage.local.set({ promptVaultData: defaultData });
    }
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_DATA') {
    chrome.storage.local.get(['promptVaultData'], (result) => {
      sendResponse({ data: result.promptVaultData });
    });
    return true;
  }

  if (message.type === 'SAVE_DATA') {
    chrome.storage.local.set({ promptVaultData: message.data }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
