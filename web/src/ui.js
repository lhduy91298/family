import { formatMoney, formatMonthDisplay, formatMonthShort, isComplete, parseOtherEntries } from './utils.js';

// Render toàn bộ app vào #app
export function renderApp(rows, currentMonth) {
  const app = document.getElementById('app');
  app.style.display = 'block';
  document.getElementById('loading').style.display = 'none';

  const current = rows.find(r => r.thang === currentMonth) || null;
  const latest  = rows.find(r => r.tich_luy > 0) || rows[0] || null;

  // Render tổng tích lũy vào header banner
  renderCumulative(latest);

  app.innerHTML = `
    ${renderCurrentMonth(current, currentMonth)}
    <div id="pie-section"></div>
    <div id="chart-section"></div>
    <div id="trend-section"></div>
    ${renderHistory(rows)}
  `;
}

export function renderChart(rows) {
  // Lấy tối đa 6 tháng gần nhất, nhưng phải đảo ngược lại để vẽ theo chiều từ trái qua phải (cũ -> mới)
  const chartRows = rows.slice(0, 6).reverse();
  
  // Không render nếu < 2 tháng có dữ liệu
  if (chartRows.length < 2) return;

  const chartSection = document.getElementById('chart-section');
  if (!chartSection) return;

  chartSection.innerHTML = `
    <p class="section-label">Biểu đồ dư hàng tháng</p>
    <div class="card chart-container">
      <canvas id="surplusChart"></canvas>
    </div>
  `;

  const ctx = document.getElementById('surplusChart').getContext('2d');
  
  // Create Gradients
  const gradSurplus = ctx.createLinearGradient(0, 0, 0, 200);
  gradSurplus.addColorStop(0, '#34d399');
  gradSurplus.addColorStop(1, '#059669');

  const gradDeficit = ctx.createLinearGradient(0, 0, 0, 200);
  gradDeficit.addColorStop(0, '#f87171');
  gradDeficit.addColorStop(1, '#dc2626');
  
  const labels = chartRows.map(r => formatMonthShort(r.thang));
  const data = chartRows.map(r => r.du_thang || 0);
  const backgroundColors = data.map(val => val >= 0 ? gradSurplus : gradDeficit);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Dư tháng (¥)',
        data: data,
        backgroundColor: backgroundColors,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: 'Outfit', size: 13 },
          bodyFont: { family: 'Outfit', size: 14, weight: 'bold' },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Outfit' } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.15)', drawBorder: false },
          ticks: { font: { family: 'Outfit' } }
        }
      }
    }
  });
}

// Biểu đồ tròn — phân bổ chi tiêu tháng hiện tại
export function renderPieChart(rows, currentMonth) {
  const row = rows.find(r => r.thang === currentMonth);
  if (!row || !isComplete(row)) return;

  const pieSection = document.getElementById('pie-section');
  if (!pieSection) return;

  const food  = row.tien_an || 0;
  const debt  = row.tien_no || 0;
  const other = Math.abs(row.tien_khac || 0);
  const surplus = Math.max(row.du_thang || 0, 0);

  pieSection.innerHTML = `
    <p class="section-label">Phân bổ chi tiêu ${formatMonthDisplay(currentMonth).replace('tháng ', '')}</p>
    <div class="card chart-container" style="height:280px;">
      <canvas id="pieChart"></canvas>
    </div>
  `;

  const ctx = document.getElementById('pieChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    plugins: [ChartDataLabels],
    data: {
      labels: ['Tiền ăn', 'Tiền nợ', 'Tiền khác', 'Tiền dư'],
      datasets: [{
        data: [food, debt, other, surplus],
        backgroundColor: ['#f59e0b', '#ef4444', '#8b5cf6', '#10b981'],
        borderWidth: 0,
        borderRadius: 4,
        spacing: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 12, weight: '500' },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: 'Inter', size: 13 },
          bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round(context.parsed / total * 100) : 0;
              return ` ${context.label}: ¥${context.parsed.toLocaleString()} (${pct}%)`;
            }
          }
        },
        datalabels: {
          color: '#fff',
          font: { family: 'Inter', size: 12, weight: '700' },
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? Math.round(value / total * 100) : 0;
            return pct >= 5 ? pct + '%' : '';
          },
          textShadowBlur: 4,
          textShadowColor: 'rgba(0,0,0,0.3)',
        }
      }
    }
  });
}

// Biểu đồ xu hướng lương & dư (Line chart)
export function renderTrendChart(rows) {
  const chartRows = rows.filter(r => r.luong > 0).slice(0, 8).reverse();
  if (chartRows.length < 2) return;

  const trendSection = document.getElementById('trend-section');
  if (!trendSection) return;

  trendSection.innerHTML = `
    <p class="section-label">Xu hướng lương & dư</p>
    <div class="card chart-container" style="height:240px;">
      <canvas id="trendChart"></canvas>
    </div>
  `;

  const ctx = document.getElementById('trendChart').getContext('2d');
  const labels = chartRows.map(r => formatMonthShort(r.thang));

  const gradSalary = ctx.createLinearGradient(0, 0, 0, 200);
  gradSalary.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
  gradSalary.addColorStop(1, 'rgba(59, 130, 246, 0.02)');

  const gradSurplus = ctx.createLinearGradient(0, 0, 0, 200);
  gradSurplus.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
  gradSurplus.addColorStop(1, 'rgba(16, 185, 129, 0.02)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Lương (¥)',
          data: chartRows.map(r => r.luong),
          borderColor: '#3b82f6',
          backgroundColor: gradSalary,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#3b82f6',
          borderWidth: 2.5,
        },
        {
          label: 'Dư tháng (¥)',
          data: chartRows.map(r => r.du_thang || 0),
          borderColor: '#10b981',
          backgroundColor: gradSurplus,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#10b981',
          borderWidth: 2.5,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            font: { family: 'Inter', size: 11, weight: '500' },
            usePointStyle: true,
            pointStyleWidth: 8,
            padding: 12,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'Inter', size: 13, weight: 'bold' },
          padding: 10,
          cornerRadius: 8,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.12)', drawBorder: false },
          ticks: { font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

// Card tháng hiện tại
function renderCurrentMonth(row, currentMonth) {
  const label = formatMonthDisplay(currentMonth);
  const complete = row && isComplete(row);

  const val = (amount, field) => {
    if (!row || row[field] === 0) {
      return `<span class="pending tag-incomplete">chưa nhập</span>`;
    }
    return `<span class="row-value">${formatMoney(amount)}</span>`;
  };

  const surplusVal = () => {
    if (!complete) return `<span class="pending tag-incomplete">—</span>`;
    const s = row.du_thang;
    const cls = s >= 0 ? 'surplus' : 'deficit';
    return `<span class="row-value ${cls}">${formatMoney(s)}</span>`;
  };

  const otherRow = () => {
    if (!row || row.tien_khac === 0 || row.tien_khac === undefined) {
      return `
        <div class="row">
          <span class="row-label"><span class="icon icon-other">📦</span>Tiền khác</span>
          <span class="pending tag-incomplete">—</span>
        </div>
      `;
    }
    const oCls = row.tien_khac >= 0 ? 'surplus' : 'deficit';

    // Parse chi tiết từng mục từ ten_khac
    let detailHtml = '';
    if (row.ten_khac) {
      const entries = parseOtherEntries(row.ten_khac);
      if (entries.length > 0) {
        const items = entries.map(e => {
          const cls = e.amount >= 0 ? 'surplus' : 'deficit';
          return `
            <div class="other-detail-item">
              <span>${e.name}</span>
              <span class="${cls}">${formatMoney(e.amount)}</span>
            </div>
          `;
        }).join('');
        detailHtml = `<div class="other-detail" id="other-detail">${items}</div>`;
      }
    }

    const hasDetail = detailHtml !== '';
    const chevron = hasDetail ? '<span class="chevron" id="other-chevron">▾</span>' : '';

    return `
      <div class="row row-clickable" ${hasDetail ? 'onclick="toggleOtherDetail()"' : ''}>
        <span class="row-label"><span class="icon icon-other">📦</span>Tiền khác ${chevron}</span>
        <span class="row-value ${oCls}">${formatMoney(row.tien_khac)}</span>
      </div>
      ${detailHtml}
    `;
  };

  return `
    <p class="section-label">${label}</p>
    <div class="card">
      <div class="row">
        <span class="row-label"><span class="icon icon-salary">💰</span>Lương</span>
        ${val(row?.luong, 'luong')}
      </div>
      <div class="row">
        <span class="row-label"><span class="icon icon-food">🍜</span>Tiền ăn</span>
        ${val(row?.tien_an, 'tien_an')}
      </div>
      <div class="row">
        <span class="row-label"><span class="icon icon-debt">💳</span>Tiền nợ</span>
        ${val(row?.tien_no, 'tien_no')}
      </div>
      ${otherRow()}
      <div class="row row-summary">
        <span class="row-label"><span class="icon icon-surplus">📊</span>Dư tháng này</span>
        ${surplusVal()}
      </div>
    </div>
    
    <button class="btn-edit" onclick="toggleEditForm()">✏️ Nhập / Sửa Dữ Liệu</button>
    <div id="edit-form" class="card edit-form" style="display: none;">
      <div class="form-group">
        <label>💰 Lương (¥)</label>
        <input type="number" id="input-salary" placeholder="VD: 200000" value="${row?.luong || ''}">
      </div>
      <div class="form-group">
        <label>🍜 Tiền ăn (¥)</label>
        <input type="number" id="input-food" placeholder="VD: 50000" value="${row?.tien_an || ''}">
      </div>
      <div class="form-group">
        <label>💳 Tiền nợ (¥)</label>
        <input type="number" id="input-debt" placeholder="VD: 30000" value="${row?.tien_no || ''}">
      </div>
      <div class="form-group">
        <label>📦 Tiền khác (¥)</label>
        <div style="display: flex; gap: 8px;">
          <input type="number" id="input-other-amount" placeholder="VD: -20000" style="flex: 1;">
          <input type="text" id="input-other-name" placeholder="Ghi chú (Mua quà)" style="flex: 2;">
        </div>
        <small style="color:var(--c-muted); margin-top:4px; display:block;">Nhập âm (-) nếu là chi, dương nếu là thu thêm.</small>
      </div>
      <button class="btn-save" onclick="saveData()" id="btn-save">💾 Lưu Thay Đổi</button>
      <div id="save-status" style="margin-top: 10px; font-size: 13px; font-weight: 500; text-align: center;"></div>
    </div>
  `;
}

// Render tổng tích lũy vào header banner
function renderCumulative(latest) {
  const slot = document.getElementById('cumul-banner-slot');
  if (!slot) return;
  const total = latest?.tich_luy || 0;
  slot.innerHTML = `
    <div class="cumul-banner">
      <div class="cumul-left">
        <div class="cumul-emoji">💰</div>
        <div>
          <div class="cumul-label">Tổng tích lũy</div>
          <div class="cumul-value">${formatMoney(total)}</div>
        </div>
      </div>
    </div>
  `;
}

// Bảng lịch sử các tháng
function renderHistory(rows) {
  if (!rows || rows.length === 0) {
    return `<p class="section-label">Chưa có dữ liệu</p>`;
  }

  const trs = rows.map(row => {
    const surplus   = row.du_thang;
    const complete  = isComplete(row);
    const cls       = !complete ? '' : surplus >= 0 ? 'surplus' : 'deficit';
    const rowCls    = !complete ? '' : surplus < 0 ? 'deficit-row' : '';
    const surplusStr = complete
      ? `<span class="${cls}">${formatMoney(surplus)}</span>`
      : `<span class="tag-incomplete">chưa đủ</span>`;

    return `
      <tr class="${rowCls}">
        <td>${formatMonthDisplay(row.thang).replace('tháng ', '')}</td>
        <td>${complete ? formatMoney(row.luong) : '—'}</td>
        <td>${complete ? formatMoney(row.tien_an) : '—'}</td>
        <td>${complete ? formatMoney(row.tien_no) : '—'}</td>
        <td>${surplusStr}</td>
      </tr>
    `;
  }).join('');

  return `
    <p class="section-label">Lịch sử các tháng</p>
    <div class="history-wrap">
      <div class="card" style="overflow:hidden">
        <table class="history-table">
          <thead>
            <tr>
              <th>Tháng</th>
              <th>Lương</th>
              <th>Tiền ăn</th>
              <th>Tiền nợ</th>
              <th>Tiền dư</th>
            </tr>
          </thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    </div>
  `;
}

export function showError(msg) {
  document.getElementById('loading').style.display = 'none';
  const errEl = document.getElementById('error');
  errEl.style.display = 'block';
  errEl.textContent = msg || 'Không tải được dữ liệu. Thử lại sau.';
}

export function updateTimestamp() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hh  = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  document.getElementById('updated-at').textContent =
    `Cập nhật lúc ${hh}:${min} JST`;
}
