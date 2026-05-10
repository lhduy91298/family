import { fetchAllMonths }         from './api.js';
import { renderApp, renderChart, renderPieChart, renderTrendChart, showError, updateTimestamp } from './ui.js';
import { getCurrentMonthJST }     from './utils.js';

async function init() {
  console.log('init() started');
  try {
    console.log('Fetching data...');
    const rows         = await fetchAllMonths();
    console.log('Data fetched', rows);
    const currentMonth = getCurrentMonthJST();
    console.log('currentMonth', currentMonth);
    renderApp(rows, currentMonth);
    console.log('renderApp done');
    renderChart(rows);
    renderPieChart(rows, currentMonth);
    renderTrendChart(rows);
    console.log('renderChart done');
    updateTimestamp();
    console.log('init() finished successfully');
  } catch (err) {
    console.error('Lỗi tải dữ liệu:', err);
    showError('Không tải được dữ liệu. Kiểm tra kết nối mạng và thử lại.');
  }
}

// Toggle hiển thị chi tiết "Tiền khác"
window.toggleOtherDetail = function() {
  const detail = document.getElementById('other-detail');
  const chevron = document.getElementById('other-chevron');
  if (detail) {
    const isOpen = detail.classList.toggle('open');
    if (chevron) chevron.textContent = isOpen ? '▴' : '▾';
  }
};

init();
