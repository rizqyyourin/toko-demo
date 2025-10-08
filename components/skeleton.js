export function tableSkeleton(cols = 5, rows = 4) {
  const wrapper = document.createElement('div');
  wrapper.className = 'w-full';
  const table = document.createElement('div');
  table.className = 'w-full';
  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'flex gap-3 items-center py-2';
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'skeleton h-4 rounded-md flex-1';
      if (c === 0) cell.style.maxWidth = '80px';
      else if (c === cols - 1) cell.style.maxWidth = '60px';
      else cell.style.maxWidth = '160px';
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  wrapper.appendChild(table);
  return wrapper;
}
