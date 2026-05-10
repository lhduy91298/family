import { formatMoney, formatMonthDisplay, formatMonthShort, isComplete, parseOtherEntries } from './utils.js';

// Render toàn bộ app vào #app
export function renderApp(rows, currentMonth) {
  const app = document.getElementById('app');
  app.style.display = 'block';
  document.getElementById('loading').style.display = 'none';

  const current = rows.find(r => r.thang === currentMonth) || null;
  const latest  = rows.find(r => r.tich_luy > 0) || rows[0] || null;

  app.innerHTML = `
    ${renderCurrentMonth(current, currentMonth)}
    ${renderCumulative(latest)}
    <div id="chart-section"></div>
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
    const sign = s >= 0 ? '+' : '-';
    return `<span class="row-value ${cls}">${sign}${formatMoney(s)}</span>`;
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
    const oSign = row.tien_khac >= 0 ? '+' : '-';
    const oCls = row.tien_khac >= 0 ? 'surplus' : 'deficit';

    // Parse chi tiết từng mục từ ten_khac
    let detailHtml = '';
    if (row.ten_khac) {
      const entries = parseOtherEntries(row.ten_khac);
      if (entries.length > 0) {
        const items = entries.map(e => {
          const sign = e.amount >= 0 ? '+' : '-';
          const cls = e.amount >= 0 ? 'surplus' : 'deficit';
          return `
            <div class="other-detail-item">
              <span>${e.name}</span>
              <span class="${cls}">${sign}${formatMoney(e.amount)}</span>
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
        <span class="row-value ${oCls}">${oSign}${formatMoney(row.tien_khac)}</span>
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
  `;
}

// Card tổng tích lũy
function renderCumulative(latest) {
  const total = latest?.tich_luy || 0;
  const sign  = total >= 0 ? '+' : '';
  return `
    <p class="section-label">Tổng tích lũy</p>
    <div class="cumul-card">
      <div class="cumul-info">
        <div class="label">Tổng dư tất cả tháng</div>
        <div class="value">${sign}${formatMoney(total)}</div>
      </div>
      <div class="cumul-icon">🏦</div>
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
    const sign      = surplus >= 0 ? '+' : '-';
    const cls       = !complete ? '' : surplus >= 0 ? 'surplus' : 'deficit';
    const rowCls    = !complete ? '' : surplus < 0 ? 'deficit-row' : '';
    const surplusStr = complete
      ? `<span class="${cls}">${sign}${formatMoney(surplus)}</span>`
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
