import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  AsyncPanel,
  Badge,
  Button,
  Checkbox,
  Combobox,
  DataTable,
  Dialog,
  InlineError,
  Menu,
  Pagination,
  QuietButton,
  SegmentedControl,
  Sheet,
  SkeletonTable,
  StatePanel,
  Switch,
  Tabs,
  ToastProvider,
  Tooltip,
  useToast,
  type Column,
} from './ui';

/* The stylesheet is the other half of every primitive's contract. jsdom does
   not apply it, so where a rule carries a guarantee (the 44 px target), the
   test asserts on the rule itself rather than on a computed style. */
const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');

function ruleFor(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

describe('Button', () => {
  it('uses a native accessible button and fires once per click', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('carries the 44px target through the class contract, not a style prop', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain('btn');
    expect(button.getAttribute('style')).toBeNull();
    expect(ruleFor('.btn')).toContain('min-height: 44px');
  });

  it('blocks interaction and announces itself while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('QuietButton', () => {
  it('is a real button that never wears the filled primary', () => {
    const onClick = vi.fn();
    render(<QuietButton onClick={onClick}>Skip</QuietButton>);
    const button = screen.getByRole('button', { name: 'Skip' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(button.className).toContain('quiet-btn');
    expect(button.className).not.toContain('btn-primary');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('takes the accent wash only when asked', () => {
    const { rerender } = render(<QuietButton>Skip</QuietButton>);
    expect(screen.getByRole('button').className).not.toContain('quiet-btn-tinted');
    rerender(<QuietButton emphasis="tinted">Skip</QuietButton>);
    expect(screen.getByRole('button').className).toContain('quiet-btn-tinted');
  });
});

describe('Badge', () => {
  it('carries status on a dot and keeps the word in ink', () => {
    const { container } = render(
      <Badge tone="success" withDot>
        In stock
      </Badge>,
    );
    expect(container.querySelector('.badge-dot')).not.toBeNull();
    expect(screen.getByText('In stock')).toBeDefined();
    // The word sits on --ink; only the dot takes the hue.
    expect(ruleFor('.badge-success')).toContain('color: var(--ink)');
    expect(ruleFor('.badge-success .badge-dot')).toContain('background: var(--good)');
  });
});

describe('StatePanel', () => {
  it('announces an error with text as well as an icon', () => {
    render(
      <StatePanel title="Couldn’t save" tone="error">
        Try again.
      </StatePanel>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t save');
    expect(screen.getByText('Try again.')).toBeDefined();
  });
});

describe('Dialog', () => {
  it('is a labelled modal that traps focus and restores it on close', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Opener
          </button>
          <Dialog onClose={() => setOpen(false)} open={open} title="Archive item">
            <button type="button">Confirm</button>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText('Archive item')).toBeDefined();
    // Focus moved into the panel rather than staying on the page behind it.
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    // Closing hands focus back, instead of dropping it on <body> and making a
    // keyboard user start the page over.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} open title="Archive item">
        <p>Body</p>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    render(
      <Dialog onClose={vi.fn()} open={false} title="Archive item">
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Sheet', () => {
  it('is a dialog anchored to an edge', () => {
    render(
      <Sheet onClose={vi.fn()} open side="bottom" title="Filters">
        <p>Body</p>
      </Sheet>,
    );
    const sheet = screen.getByRole('dialog');
    expect(sheet.className).toContain('sheet-bottom');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
  });
});

describe('Menu', () => {
  it('opens, walks with arrow keys, and runs the chosen action', () => {
    const onSelect = vi.fn();
    render(
      <Menu
        actions={[
          { label: 'Rename', onSelect: vi.fn() },
          'separator',
          { danger: true, label: 'Archive', onSelect },
        ]}
        label="Row actions"
        trigger="⋯"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Tooltip', () => {
  it('describes its child on focus and hides on Escape', () => {
    render(
      <Tooltip label="Counted 3 days ago">
        <button type="button">Info</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Info' });
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip').textContent).toBe('Counted 3 days ago');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Toast', () => {
  it('announces an error assertively and dismisses on demand', () => {
    function Trigger() {
      const { toast } = useToast();
      return (
        <button onClick={() => toast({ title: 'Save failed', tone: 'error' })} type="button">
          Break it
        </button>
      );
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Break it' }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Save failed');
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Tabs', () => {
  it('wires tab to panel and moves with arrow keys', () => {
    function Harness() {
      const [value, setValue] = useState('a');
      return (
        <Tabs
          label="Sections"
          onChange={setValue}
          tabs={[
            { content: <p>Panel A</p>, id: 'a', label: 'First' },
            { content: <p>Panel B</p>, id: 'b', label: 'Second' },
          ]}
          value={value}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole('tabpanel').textContent).toBe('Panel A');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel').textContent).toBe('Panel B');
    expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('SegmentedControl', () => {
  it('is a radiogroup whose arrow keys change the choice', () => {
    function Harness() {
      const [value, setValue] = useState<'all' | 'low'>('all');
      return (
        <SegmentedControl
          label="Views"
          onChange={setValue}
          segments={[
            { label: 'All', value: 'all' },
            { label: 'Low', value: 'low' },
          ]}
          value={value}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Low' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Switch', () => {
  it('reports and toggles its checked state', () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Switch checked={on} label="Email alerts" onChange={setOn} />;
    }
    render(<Harness />);
    const control = screen.getByRole('switch', { name: 'Email alerts' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(control.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Checkbox', () => {
  it('toggles and carries the indeterminate DOM property', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Checkbox checked={false} label="Include archived" onChange={onChange} />,
    );
    const box = screen.getByRole('checkbox', { name: 'Include archived' }) as HTMLInputElement;
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(
      <Checkbox checked={false} indeterminate label="Include archived" onChange={onChange} />,
    );
    expect(box.indeterminate).toBe(true);
  });
});

describe('Combobox', () => {
  it('filters as you type and commits with Enter', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        label="Item"
        onChange={onChange}
        options={[
          { label: 'Olive oil', value: 'oil' },
          { label: 'Oregano', value: 'oregano' },
          { label: 'Basmati rice', value: 'rice' },
        ]}
        value=""
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Item' });
    fireEvent.change(input, { target: { value: 'ore' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('oregano');
  });

  it('says so when nothing matches instead of showing an empty box', () => {
    render(
      <Combobox
        label="Item"
        onChange={vi.fn()}
        options={[{ label: 'Olive oil', value: 'oil' }]}
        value=""
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Item' }), {
      target: { value: 'zzz' },
    });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matches')).toBeDefined();
  });
});

describe('Pagination', () => {
  it('marks the current page and disables the ends', () => {
    const onPageChange = vi.fn();
    render(<Pagination onPageChange={onPageChange} page={1} pageCount={4} />);
    expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination onPageChange={vi.fn()} page={1} pageCount={1} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Skeleton', () => {
  it('stands in the table geometry and stays out of the accessibility tree', () => {
    const { container } = render(<SkeletonTable columns={4} rows={6} />);
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(6);
    expect(container.querySelector('.dt-scroll')?.getAttribute('aria-hidden')).toBe('true');
    // Transform/opacity only — a width or height animation relayouts every frame.
    expect(ruleFor('.skeleton')).toContain('animation: skeleton-pulse');
    expect(css).toContain('@keyframes skeleton-pulse');
  });
});

describe('InlineError', () => {
  it('retries in place rather than replacing the page', () => {
    const onRetry = vi.fn();
    render(<InlineError detail="Network unreachable" onRetry={onRetry} title="Couldn’t load" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Couldn’t load');
    expect(alert.textContent).toContain('Network unreachable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('AsyncPanel', () => {
  it('shows a skeleton first, then keeps content on screen when a refresh fails', () => {
    const { rerender } = render(
      <AsyncPanel hasContent={false} loading skeleton={<SkeletonTable />}>
        <p>Real content</p>
      </AsyncPanel>,
    );
    expect(screen.queryByText('Real content')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Loading…');

    rerender(
      <AsyncPanel error="Network unreachable" hasContent loading={false} skeleton={<SkeletonTable />}>
        <p>Real content</p>
      </AsyncPanel>,
    );
    // A stale table beats no table: the error joins the content, it does not
    // replace it.
    expect(screen.getByText('Real content')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Network unreachable');
  });
});

/* ---------- DataTable ---------- */

type Row = { id: string; name: string; qty: number; status: string };

const rows500: Row[] = Array.from({ length: 500 }, (_, index) => ({
  id: `row-${index}`,
  name: `Item ${String(index).padStart(3, '0')}`,
  qty: (index * 7) % 251,
  status: index % 3 === 0 ? 'low_stock' : 'in_stock',
}));

const columns: Column<Row>[] = [
  { id: 'name', header: 'Item', cell: (row) => row.name, sortValue: (row) => row.name },
  {
    id: 'qty',
    header: 'On hand',
    align: 'end',
    numeric: true,
    cell: (row) => row.qty,
    sortValue: (row) => row.qty,
  },
  { id: 'status', header: 'Status', cell: (row) => row.status },
];

function renderTable(extra: Partial<ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <DataTable
      caption="Items"
      columns={columns}
      getRowId={(row) => row.id}
      rows={rows500}
      searchValue={(row) => row.name}
      {...extra}
    />,
  );
}

describe('DataTable', () => {
  it('pages a 500-row dataset instead of mounting it', () => {
    const started = performance.now();
    const { container } = renderTable();
    const elapsed = performance.now() - started;

    // The whole point: 50 rows reach the DOM, not 500.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(50);
    expect(screen.getByText(/500 rows/)).toBeDefined();
    expect(screen.getByText(/page 1 of 10/)).toBeDefined();
    // Generous by an order of magnitude — this catches a regression to
    // rendering every row, not a few milliseconds of drift.
    expect(elapsed).toBeLessThan(2000);
  });

  it('sorts through the header, ascending then descending then off', () => {
    const { container } = renderTable();
    const first = () => container.querySelector('tbody tr td')?.textContent;
    expect(first()).toBe('Item 000');

    const sortByQty = screen.getByRole('button', { name: 'Sort by On hand' });
    fireEvent.click(sortByQty);
    expect(container.querySelectorAll('tbody tr')[0]?.textContent).toContain('0');

    fireEvent.click(sortByQty);
    // Descending puts the largest quantity first.
    const descTop = container.querySelectorAll('tbody tr')[0]?.textContent ?? '';
    expect(descTop).toContain('250');

    fireEvent.click(sortByQty);
    expect(first()).toBe('Item 000');
  });

  it('announces sort state on the column header, not the button', () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: /On hand/ });
    expect(header.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by On hand' }));
    expect(header.getAttribute('aria-sort')).toBe('ascending');
  });

  it('filters with chips and reports the narrowed count', () => {
    renderTable({
      filters: [{ id: 'low', label: 'Low stock', predicate: (row) => row.status === 'low_stock' }],
    });
    const chip = screen.getByRole('button', { name: /Low stock/ });
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/167 of 500 rows/)).toBeDefined();
  });

  it('searches the haystack the caller supplies', () => {
    const { container } = renderTable();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Items' }), {
      target: { value: 'Item 042' },
    });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('selects rows and exposes them to bulk actions', () => {
    const onArchive = vi.fn();
    renderTable({
      selectable: true,
      bulkActions: (selected) => (
        <QuietButton onClick={() => onArchive(selected)}>Archive selected</QuietButton>
      ),
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row row-0' }));
    expect(screen.getByText('1 selected')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Archive selected' }));
    expect(onArchive).toHaveBeenCalledWith([expect.objectContaining({ id: 'row-0' })]);
  });

  it('select-all covers the current page only, and clears', () => {
    const { container } = renderTable({ selectable: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    expect(screen.getByText('50 selected')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('50 selected')).toBeNull();
    expect(container.querySelectorAll('tbody tr[aria-selected="true"]')).toHaveLength(0);
  });

  it('swaps the page rather than growing the DOM', () => {
    const { container } = renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(50);
    expect(container.querySelector('tbody tr td')?.textContent).toBe('Item 050');
  });

  it('applies a saved view’s scope and sort together', () => {
    const { container } = renderTable({
      views: [
        { id: 'all', label: 'All' },
        {
          id: 'low',
          label: 'Low stock',
          predicate: (row) => row.status === 'low_stock',
          sort: { columnId: 'qty', direction: 'descending' },
        },
      ],
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Low stock' }));
    expect(screen.getByText(/167 of 500 rows/)).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /On hand/ }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(50);
  });

  it('sticks the header and keeps quantities on the numeric step', () => {
    const { container } = renderTable();
    expect(ruleFor('.dt-table th')).toContain('position: sticky');
    expect(container.querySelector('tbody tr td.numeric')).not.toBeNull();
  });

  it('shows an empty state rather than a bare header when nothing matches', () => {
    renderTable();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Items' }), {
      target: { value: 'nothing here' },
    });
    expect(screen.getByText('No results')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a matching skeleton while loading, never prose', () => {
    const { container } = renderTable({ loading: true });
    expect(container.querySelector('.skeleton-row')).not.toBeNull();
    expect(container.textContent).toBe('');
  });
});
