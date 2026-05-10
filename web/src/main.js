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

window.toggleEditForm = function() {
  const form = document.getElementById('edit-form');
  if (form) {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }
};

window.saveData = async function() {
  const btn = document.getElementById('btn-save');
  const status = document.getElementById('save-status');
  btn.disabled = true;
  status.textContent = 'Đang lưu...';
  status.style.color = 'var(--c-muted)';

  const salary = document.getElementById('input-salary').value;
  const food = document.getElementById('input-food').value;
  const debt = document.getElementById('input-debt').value;
  const otherAmt = document.getElementById('input-other-amount').value;
  const otherName = document.getElementById('input-other-name').value;

  const url = 'https://family-expense-bot.lhduy91298.workers.dev/api/update';

  try {
    const updates = [];
    if (salary) updates.push({ field: 'salary', amount: Number(salary) });
    if (food) updates.push({ field: 'food', amount: Number(food) });
    if (debt) updates.push({ field: 'debt', amount: Number(debt) });
    if (otherAmt) updates.push({ field: 'other', amount: Number(otherAmt), name: otherName });

    for (const data of updates) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Lỗi khi lưu ' + data.field);
    }

    status.textContent = '✅ Đã lưu thành công! Đang tải lại...';
    status.style.color = 'var(--c-accent)';
    setTimeout(() => location.reload(), 1500);

  } catch (err) {
    console.error(err);
    status.textContent = '❌ Lỗi: ' + err.message;
    status.style.color = 'var(--c-red)';
    btn.disabled = false;
  }
};

init();
