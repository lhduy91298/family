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

window.toggleFoodDetail = function() {
  const detail = document.getElementById('food-detail');
  const chevron = document.getElementById('food-chevron');
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

window.addOtherInput = function() {
  const container = document.getElementById('other-inputs-container');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'other-input-row';
  div.style.display = 'flex';
  div.style.gap = '8px';
  div.style.marginBottom = '8px';
  
  div.innerHTML = `
    <input type="number" class="other-amt" placeholder="VD: -20000" style="flex: 1;">
    <input type="text" class="other-name" placeholder="Ghi chú (Mua quà)" style="flex: 2;">
    <span onclick="this.parentElement.remove()" style="cursor: pointer; color: var(--c-red); font-weight: bold; font-size: 18px; line-height: 38px;" title="Xóa mục này">×</span>
  `;
  container.appendChild(div);
};

window.addFoodInput = function() {
  const container = document.getElementById('food-inputs-container');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'food-input-row';
  div.style.display = 'flex';
  div.style.gap = '8px';
  div.style.marginBottom = '8px';
  
  div.innerHTML = `
    <input type="number" class="food-amt" placeholder="VD: 5000" style="flex: 1;">
    <input type="text" class="food-name" placeholder="Ghi chú (Siêu thị)" style="flex: 2;">
    <span onclick="this.parentElement.remove()" style="cursor: pointer; color: var(--c-red); font-weight: bold; font-size: 18px; line-height: 38px;" title="Xóa mục này">×</span>
  `;
  container.appendChild(div);
};

window.saveData = async function() {
  const btn = document.getElementById('btn-save');
  const status = document.getElementById('save-status');
  btn.disabled = true;
  status.textContent = 'Đang lưu...';
  status.style.color = 'var(--c-muted)';

  const url = 'https://family-expense-bot.lhduy91298.workers.dev/api/update';

  try {
    const salaryEl = document.getElementById('input-salary');
    const foodEl = document.getElementById('input-food');
    const debtEl = document.getElementById('input-debt');

    const salary = salaryEl ? salaryEl.value : '';
    const food = foodEl ? foodEl.value : '';
    const debt = debtEl ? debtEl.value : '';

    const updates = [];
    if (salary) updates.push({ field: 'salary', amount: Number(salary) });
    if (food) updates.push({ field: 'food', amount: Number(food) });
    if (debt) updates.push({ field: 'debt', amount: Number(debt) });

    const foodRows = document.querySelectorAll('.food-input-row');
    foodRows.forEach(row => {
      const amtInput = row.querySelector('.food-amt');
      const nameInput = row.querySelector('.food-name');
      if (amtInput && amtInput.value) {
        updates.push({ field: 'food_add', amount: Number(amtInput.value), name: nameInput ? nameInput.value : '' });
      }
    });

    const otherRows = document.querySelectorAll('.other-input-row');
    otherRows.forEach(row => {
      const amtInput = row.querySelector('.other-amt');
      const nameInput = row.querySelector('.other-name');
      if (amtInput && amtInput.value) {
        updates.push({ field: 'other', amount: Number(amtInput.value), name: nameInput ? nameInput.value : '' });
      }
    });

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

window.deleteOtherEntry = async function(index) {
  if (!confirm('Bạn có chắc chắn muốn xóa mục này?')) return;
  
  const url = 'https://family-expense-bot.lhduy91298.workers.dev/api/update';
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'other_delete', index: index })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Lỗi khi xóa mục tiền khác');
    }
    
    alert('Đã xóa thành công!');
    location.reload();
  } catch (err) {
    console.error(err);
    alert('❌ Lỗi: ' + err.message);
  }
};

window.deleteFoodEntry = async function(index) {
  if (!confirm('Bạn có chắc chắn muốn xóa chi tiết tiền ăn này?')) return;
  
  const url = 'https://family-expense-bot.lhduy91298.workers.dev/api/update';
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'food_delete', index: index })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Lỗi khi xóa mục tiền ăn');
    }
    
    alert('Đã xóa thành công!');
    location.reload();
  } catch (err) {
    console.error(err);
    alert('❌ Lỗi: ' + err.message);
  }
};

init();
