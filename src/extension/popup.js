const totalCountEl = document.getElementById('totalCount');
const readyCountEl = document.getElementById('readyCount');
const failedCountEl = document.getElementById('failedCount');
const installedStateEl = document.getElementById('installedState');
const statusEl = document.getElementById('status');

function setStatus(message) {
  statusEl.textContent = message;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('当前标签页不可用');
  return chrome.tabs.sendMessage(tab.id, message);
}

async function refreshSummary() {
  try {
    const summary = await sendToActiveTab({ type: 'gwr:get-summary' });
    totalCountEl.textContent = String(summary?.total ?? 0);
    readyCountEl.textContent = String(summary?.ready ?? 0);
    failedCountEl.textContent = String(summary?.failed ?? 0);
    installedStateEl.textContent = summary?.installed ? '是' : '否';

    if (!summary?.installed) {
      setStatus('当前页面尚未安装 hook 或还未初始化完成');
      return;
    }

    if ((summary?.total ?? 0) <= 0) {
      setStatus('当前页面还没有触发 Gemini 图片复制/下载请求');
      return;
    }

    if ((summary?.failed ?? 0) > 0) {
      setStatus('最近有请求处理失败，已回退到原始响应');
      return;
    }

    setStatus('下载流 hook 正常工作');
  } catch {
    totalCountEl.textContent = '0';
    readyCountEl.textContent = '0';
    failedCountEl.textContent = '0';
    installedStateEl.textContent = '否';
    setStatus('请在 Gemini 图片页面打开弹窗');
  }
}

void refreshSummary();
