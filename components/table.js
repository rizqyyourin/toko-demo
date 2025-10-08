export function createTable({ columns = [], rows = [], rowKey = null, classes = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'w-full overflow-x-auto';
  const table = document.createElement('table');
  table.className = `min-w-full divide-y divide-border ${classes}`;

  const thead = document.createElement('thead');
  thead.className = 'bg-surface sticky top-0';
  const tr = document.createElement('tr');
  for (const col of columns) {
  const th = document.createElement('th');
  th.scope = 'col';
  th.className = `px-3 py-2 text-left text-sm font-medium text-muted ${col.class || ''}`;
    th.textContent = col.label;
    if (col.sortable) {
      th.classList.add('cursor-pointer');
    }
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.className = 'bg-surface divide-y divide-border';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.className = 'odd:bg-[rgba(99,102,241,0.03)]';
    for (const col of columns) {
  const td = document.createElement('td');
  td.className = `px-3 py-2 text-sm text-text ${col.tdClass || ''}`;
      let v = r[col.field];
      if (col.render) td.appendChild(col.render(v, r));
      else td.textContent = (v == null) ? '' : String(v);
      if (col.title) td.title = td.textContent;
      tr.appendChild(td);
    }
    if (rowKey && r[rowKey]) tr.dataset.key = r[rowKey];
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return { table, tbody, wrap };
}
