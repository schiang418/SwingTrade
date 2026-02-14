(function () {
  'use strict';

  // State
  let uploadedStocks = [];
  let analysisResults = null;
  let currentSort = { key: 'rank', dir: 'asc' };

  // DOM refs
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');
  const fileInfo = document.getElementById('file-info');
  const fileName = document.getElementById('file-name');
  const clearFileBtn = document.getElementById('clear-file');
  const tickersSection = document.getElementById('tickers-section');
  const tickerCount = document.getElementById('ticker-count');
  const tickerChips = document.getElementById('ticker-chips');
  const analyzeBtn = document.getElementById('analyze-btn');
  const loadingSection = document.getElementById('loading-section');
  const loadingText = document.getElementById('loading-text');
  const resultsSection = document.getElementById('results-section');
  const resultsBody = document.getElementById('results-body');
  const spyInfo = document.getElementById('spy-info');
  const analyzedAt = document.getElementById('analyzed-at');
  const newAnalysisBtn = document.getElementById('new-analysis-btn');
  const errorsSection = document.getElementById('errors-section');
  const errorsList = document.getElementById('errors-list');
  const detailModal = document.getElementById('detail-modal');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const modalTicker = document.getElementById('modal-ticker');
  const modalBody = document.getElementById('modal-body');
  const uploadSection = document.getElementById('upload-section');

  // Prevent browser from opening files dropped outside the upload area
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // File upload handlers
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  uploadArea.addEventListener('click', () => fileInput.click());

  let dragCounter = 0;

  uploadArea.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  uploadArea.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      uploadArea.classList.remove('dragover');
    }
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  clearFileBtn.addEventListener('click', resetUpload);
  analyzeBtn.addEventListener('click', runAnalysis);
  newAnalysisBtn.addEventListener('click', resetAll);
  modalOverlay.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);

  // Sortable headers
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.key = key;
        currentSort.dir = key === 'rank' ? 'asc' : 'desc';
      }
      renderResults();
    });
  });

  async function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      alert('Please upload an .xlsx, .xls, or .csv file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      uploadArea.style.opacity = '0.5';
      browseBtn.disabled = true;

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      uploadedStocks = data.stocks;
      fileName.textContent = `${file.name} (${data.count} tickers)`;
      fileInfo.hidden = false;
      uploadArea.hidden = true;

      // Show tickers
      tickerCount.textContent = data.count;
      tickerChips.innerHTML = uploadedStocks
        .map(
          (s) =>
            `<span class="ticker-chip" title="${s.sector} - ${s.industry}">${s.ticker}</span>`
        )
        .join('');
      tickersSection.hidden = false;
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      uploadArea.style.opacity = '1';
      browseBtn.disabled = false;
    }
  }

  function resetUpload() {
    fileInput.value = '';
    fileInfo.hidden = true;
    uploadArea.hidden = false;
    tickersSection.hidden = true;
    uploadedStocks = [];
  }

  function resetAll() {
    resetUpload();
    resultsSection.hidden = true;
    errorsSection.hidden = true;
    analysisResults = null;
    uploadSection.hidden = false;
  }

  async function runAnalysis() {
    if (uploadedStocks.length === 0) return;

    uploadSection.hidden = true;
    tickersSection.hidden = true;
    loadingSection.hidden = false;
    loadingText.textContent = `Fetching market data for ${uploadedStocks.length} stocks...`;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stocks: uploadedStocks }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      analysisResults = data;
      loadingSection.hidden = true;
      showResults();
    } catch (err) {
      loadingSection.hidden = true;
      uploadSection.hidden = false;
      tickersSection.hidden = false;
      alert('Analysis error: ' + err.message);
    }
  }

  function showResults() {
    resultsSection.hidden = false;

    // SPY info
    if (analysisResults.spyData) {
      spyInfo.textContent = `SPY: 1M ${fmtPct(analysisResults.spyData.return1m)} | 3M ${fmtPct(analysisResults.spyData.return3m)}`;
    }
    analyzedAt.textContent = `Analyzed: ${new Date(analysisResults.analyzedAt).toLocaleString()}`;

    // Errors
    if (analysisResults.fetchErrors && analysisResults.fetchErrors.length > 0) {
      errorsSection.hidden = false;
      errorsList.innerHTML = analysisResults.fetchErrors
        .map((e) => `<li><strong>${e.ticker}</strong>: ${e.error}</li>`)
        .join('');
    } else {
      errorsSection.hidden = true;
    }

    renderResults();
  }

  function renderResults() {
    if (!analysisResults) return;

    const sorted = [...analysisResults.results].sort((a, b) => {
      const key = currentSort.key;
      let va = a[key];
      let vb = b[key];
      if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = (vb || '').toLowerCase();
      }
      if (va < vb) return currentSort.dir === 'asc' ? -1 : 1;
      if (va > vb) return currentSort.dir === 'asc' ? 1 : -1;
      return 0;
    });

    // Update header sort indicators
    document.querySelectorAll('th.sortable').forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === currentSort.key) {
        th.classList.add(currentSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });

    resultsBody.innerHTML = sorted.map((r) => buildRow(r)).join('');

    // Clickable rows
    resultsBody.querySelectorAll('tr.clickable').forEach((tr) => {
      tr.addEventListener('click', () => {
        const ticker = tr.dataset.ticker;
        const stock = analysisResults.results.find((r) => r.ticker === ticker);
        if (stock) openModal(stock);
      });
    });
  }

  function buildRow(r) {
    if (r.error) {
      return `<tr><td class="rank-cell">-</td><td class="ticker-cell">${esc(r.ticker)}</td><td colspan="13" class="negative">${esc(r.error)}</td></tr>`;
    }

    const cls = scoreClass(r.finalScore);
    const signal = getSignal(r.finalScore);
    const ind = r.indicators || {};

    return `<tr class="clickable" data-ticker="${esc(r.ticker)}">
      <td class="rank-cell">${r.rank}</td>
      <td class="ticker-cell">${esc(r.ticker)}</td>
      <td class="neutral" style="font-size:12px">${esc(r.sector)}</td>
      <td class="neutral" style="font-size:12px">${esc(r.industry)}</td>
      <td><span class="score-badge ${cls}">${r.finalScore.toFixed(1)}</span></td>
      <td class="sub-score">${scoreBar(r.rsScore)}</td>
      <td class="sub-score">${scoreBar(r.trendScore)}</td>
      <td class="sub-score">${scoreBar(r.pullbackScore)}</td>
      <td class="sub-score">${scoreBar(r.volatilityScore)}</td>
      <td>$${ind.close != null ? ind.close.toFixed(2) : '-'}</td>
      <td class="${rsiClass(ind.rsi14)}">${ind.rsi14 != null ? ind.rsi14.toFixed(1) : '-'}</td>
      <td>${ind.atrPct != null ? ind.atrPct.toFixed(1) + '%' : '-'}</td>
      <td class="${ind.return1m >= 0 ? 'positive' : 'negative'}">${fmtPct(ind.return1m)}</td>
      <td class="${ind.return3m >= 0 ? 'positive' : 'negative'}">${fmtPct(ind.return3m)}</td>
      <td class="signal-cell ${cls}">${signal}</td>
    </tr>`;
  }

  function scoreBar(val) {
    const cls = scoreClass(val);
    const color = cls === 'score-prime' ? 'var(--green)' : cls === 'score-strong' ? 'var(--accent)' : cls === 'score-ok' ? 'var(--yellow)' : 'var(--red)';
    return `<div class="score-bar-container">
      <span style="min-width:32px">${val.toFixed(0)}</span>
      <div class="score-bar"><div class="score-bar-fill" style="width:${Math.min(val, 100)}%;background:${color}"></div></div>
    </div>`;
  }

  function scoreClass(score) {
    if (score >= 85) return 'score-prime';
    if (score >= 70) return 'score-strong';
    if (score >= 55) return 'score-ok';
    return 'score-avoid';
  }

  function getSignal(score) {
    if (score >= 85) return 'PRIME ENTRY';
    if (score >= 70) return 'WATCHLIST';
    if (score >= 55) return 'CAUTION';
    return 'AVOID';
  }

  function rsiClass(val) {
    if (val == null) return '';
    if (val >= 70) return 'negative';
    if (val <= 30) return 'positive';
    if (val >= 45 && val <= 65) return 'positive';
    return '';
  }

  function fmtPct(val) {
    if (val == null) return '-';
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(1) + '%';
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function openModal(stock) {
    const ind = stock.indicators || {};
    modalTicker.textContent = `${stock.ticker} - ${stock.name || ''}`;

    modalBody.innerHTML = `
      <div class="detail-grid">
        <div class="detail-card">
          <h4>Final Score</h4>
          <div class="score-value ${scoreClass(stock.finalScore)}" style="color:inherit">${stock.finalScore.toFixed(1)}</div>
          <p class="signal-cell ${scoreClass(stock.finalScore)}" style="margin-top:4px">${getSignal(stock.finalScore)}</p>
          <div style="margin-top:8px;font-size:12px;color:var(--text-dim)">${stock.sector} / ${stock.industry}</div>
        </div>
        <div class="detail-card">
          <h4>Price & Trend</h4>
          <div class="detail-row"><span class="detail-label">Close</span><span>$${ind.close?.toFixed(2) ?? '-'}</span></div>
          <div class="detail-row"><span class="detail-label">EMA(20)</span><span>$${ind.ema20?.toFixed(2) ?? '-'}</span></div>
          <div class="detail-row"><span class="detail-label">SMA(50)</span><span>$${ind.sma50?.toFixed(2) ?? '-'}</span></div>
          <div class="detail-row"><span class="detail-label">Dist from EMA20</span><span>${ind.dist20 != null ? ind.dist20.toFixed(2) + '%' : '-'}</span></div>
          <div class="detail-row"><span class="detail-label">Dist from SMA50</span><span>${ind.dist50 != null ? ind.dist50.toFixed(2) + '%' : '-'}</span></div>
        </div>
        <div class="detail-card">
          <h4>Category Scores</h4>
          <div class="detail-row"><span class="detail-label">Relative Strength (40%)</span><span>${stock.rsScore.toFixed(1)}</span></div>
          <div class="detail-row"><span class="detail-label">RS Composite</span><span>${stock.rsComposite != null ? stock.rsComposite.toFixed(2) : '-'}</span></div>
          <div class="detail-row"><span class="detail-label">Trend Structure (25%)</span><span>${stock.trendScore.toFixed(1)}</span></div>
          <div class="detail-row"><span class="detail-label">Pullback Setup (20%)</span><span>${stock.pullbackScore.toFixed(1)}</span></div>
          <div class="detail-row"><span class="detail-label">Volatility (15%)</span><span>${stock.volatilityScore.toFixed(1)}</span></div>
        </div>
        <div class="detail-card">
          <h4>Momentum & Volatility</h4>
          <div class="detail-row"><span class="detail-label">RSI(14)</span><span>${ind.rsi14?.toFixed(1) ?? '-'}</span></div>
          <div class="detail-row"><span class="detail-label">ATR(14)</span><span>$${ind.atr14?.toFixed(2) ?? '-'}</span></div>
          <div class="detail-row"><span class="detail-label">ATR %</span><span>${ind.atrPct?.toFixed(2) ?? '-'}%</span></div>
          <div class="detail-row"><span class="detail-label">1M Return</span><span class="${(ind.return1m || 0) >= 0 ? 'positive' : 'negative'}">${fmtPct(ind.return1m)}</span></div>
          <div class="detail-row"><span class="detail-label">3M Return</span><span class="${(ind.return3m || 0) >= 0 ? 'positive' : 'negative'}">${fmtPct(ind.return3m)}</span></div>
          <div class="detail-row"><span class="detail-label">Avg Vol (20d)</span><span>${ind.avgVol20 != null ? formatVol(ind.avgVol20) : '-'}</span></div>
        </div>
      </div>
    `;

    detailModal.hidden = false;
  }

  function closeModal() {
    detailModal.hidden = true;
  }

  function formatVol(vol) {
    if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(0) + 'K';
    return vol.toFixed(0);
  }

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailModal.hidden) {
      closeModal();
    }
  });
})();
